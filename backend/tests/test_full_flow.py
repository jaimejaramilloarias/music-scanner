"""Pruebas de integración para validar el flujo completo del backend OMR."""

from __future__ import annotations

import importlib
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

    # Recargar los módulos de configuración para que lean las variables de entorno.
    config_module = importlib.import_module("app.core.config")
    importlib.reload(config_module)
    app_module = importlib.import_module("app")
    importlib.reload(app_module)

    application = app_module.create_app()
    return TestClient(application), results_dir


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
    assert stored_file.read_text(encoding="utf-8").strip() == download_response.text.strip()
