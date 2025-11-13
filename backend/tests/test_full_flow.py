"""Pruebas de integración para validar el flujo completo del backend OMR."""

from __future__ import annotations

import importlib
import json
from pathlib import Path
import sys
from typing import Tuple
from urllib.parse import urlparse

import pytest
from fastapi.testclient import TestClient


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


@pytest.fixture()
def client(tmp_path, monkeypatch) -> Tuple[TestClient, Path]:
    """Crea una instancia de la API configurada para pruebas."""

    results_dir = tmp_path / "results"
    monkeypatch.setenv("OMR_RESULTS_DIR", str(results_dir))
    monkeypatch.setenv("OMR_PUBLIC_BASE_URL", "http://testserver")
    monkeypatch.setenv("OMR_ENABLE_STUB_OMR", "true")
    monkeypatch.setenv(
        "OMR_ALLOWED_ORIGINS",
        "[\"http://localhost:8000\", \"http://testserver\"]",
    )
    monkeypatch.setenv(
        "OMR_AUDIVERIS_PROCESSING_PRESETS",
        json.dumps(
            {
                "auto": [],
                "printed": ["--engine", "printed"],
                "handwritten": ["--engine", "handwritten"],
            }
        ),
    )

    # Recargar los módulos de configuración para que lean las variables de entorno.
    config_module = importlib.import_module("app.core.config")
    importlib.reload(config_module)
    core_module = importlib.import_module("app.core")
    importlib.reload(core_module)
    omr_service_module = importlib.import_module("app.services.omr")
    importlib.reload(omr_service_module)
    omr_routes_module = importlib.import_module("app.api.routes.omr")
    importlib.reload(omr_routes_module)
    app_module = importlib.import_module("app")
    importlib.reload(app_module)

    application = app_module.create_app()
    settings_module = importlib.import_module("app.core.config")
    resolved_results_dir = Path(settings_module.settings.results_dir)
    return TestClient(application), resolved_results_dir


def test_full_conversion_flow_creates_downloadable_musicxml(
    client: Tuple[TestClient, Path]
) -> None:
    """El endpoint principal debe devolver una URL de descarga funcional."""

    test_client, results_dir = client

    file_content = b"\x89PNG\r\n\x1a\n" + b"data"
    files = {"file": ("partitura.png", file_content, "image/png")}

    response = test_client.post("/api/omr", files=files)

    assert response.status_code == 200
    payload = response.json()

    assert payload["status"] == "ok"
    assert payload["musicxml_url"].startswith("http://testserver/api/files/musicxml/")
    assert payload["original_filename"] == "partitura.png"
    assert payload["processing_mode"] == "auto"
    assert payload["applied_cli_arguments"] == []

    result_url = urlparse(payload["musicxml_url"])
    download_response = test_client.get(result_url.path)

    assert download_response.status_code == 200
    assert (
        download_response.headers["content-type"]
        == "application/vnd.recordare.musicxml+xml"
    )
    assert download_response.text.startswith("<?xml")

    stored_file = results_dir / f"{payload['result_id']}.musicxml"
    assert stored_file.exists()
    stored_content = stored_file.read_text(encoding="utf-8").strip()
    assert stored_content == download_response.text.strip()
    assert "Modo de reconocimiento: auto" in stored_content


def test_custom_processing_mode_and_extra_arguments(client) -> None:
    """El backend debe aplicar el modo de procesamiento indicado."""

    test_client, results_dir = client

    file_content = b"\x89PNG\r\n\x1a\n" + b"data"
    files = {"file": ("partitura.png", file_content, "image/png")}
    data = {
        "processing_mode": "printed",
        "advanced_options": "--lang es --threshold 0.75",
    }

    response = test_client.post("/api/omr", files=files, data=data)

    assert response.status_code == 200
    payload = response.json()

    assert payload["processing_mode"] == "printed"
    assert payload["applied_cli_arguments"] == [
        "--engine",
        "printed",
        "--lang",
        "es",
        "--threshold",
        "0.75",
    ]

    stored_file = results_dir / f"{payload['result_id']}.musicxml"
    existing_files = list(results_dir.glob("*.musicxml"))
    assert stored_file.exists(), existing_files
    contents = stored_file.read_text(encoding="utf-8")
    assert "Modo de reconocimiento: printed" in contents
    assert "Parámetros adicionales: --engine printed --lang es --threshold 0.75" in contents


def test_invalid_processing_mode_returns_error(client) -> None:
    """Debe devolver un error claro cuando se envía un modo desconocido."""

    test_client, _ = client

    file_content = b"\x89PNG\r\n\x1a\n" + b"data"
    files = {"file": ("partitura.png", file_content, "image/png")}
    data = {"processing_mode": "experimental"}

    response = test_client.post("/api/omr", files=files, data=data)

    assert response.status_code == 422
    payload = response.json()
    assert payload["status"] == "error"
    assert "modos permitidos" in payload["message"].lower()
