"""Pruebas de integración para validar el flujo completo del backend OMR."""

from __future__ import annotations

import importlib
import json
from pathlib import Path
import sys
from typing import Callable, Tuple
from urllib.parse import urlparse

import pytest
from fastapi.testclient import TestClient


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def _reload_backend_modules() -> dict[str, object]:
    modules_to_reload = [
        "app.core.config",
        "app.core",
        "app.services.omr",
        "app.api.routes.omr",
        "app",
    ]
    reloaded_modules: dict[str, object] = {}
    for module_name in modules_to_reload:
        module = importlib.import_module(module_name)
        reloaded_modules[module_name] = importlib.reload(module)
    return reloaded_modules


def _configure_environment(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    extra_env: dict[str, str] | None = None,
) -> Tuple[TestClient, Path]:
    base_env = {
        "OMR_RESULTS_DIR": str(tmp_path / "results"),
        "OMR_PUBLIC_BASE_URL": "http://testserver",
        "OMR_ENABLE_STUB_OMR": "true",
        "OMR_ALLOWED_ORIGINS": "[\"http://localhost:8000\", \"http://testserver\"]",
        "OMR_AUDIVERIS_PROCESSING_PRESETS": json.dumps(
            {
                "auto": [],
                "printed": ["--engine", "printed"],
                "handwritten": ["--engine", "handwritten"],
            }
        ),
    }

    if extra_env:
        base_env.update(extra_env)

    for key, value in base_env.items():
        monkeypatch.setenv(key, value)

    modules = _reload_backend_modules()
    application = modules["app"].create_app()  # type: ignore[no-any-return]
    settings_module = modules["app.core.config"]
    resolved_results_dir = Path(settings_module.settings.results_dir)
    return TestClient(application), resolved_results_dir


@pytest.fixture()
def client_factory(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Callable[[dict[str, str] | None], Tuple[TestClient, Path]]:
    """Permite crear clientes de prueba con configuraciones personalizadas."""

    def factory(extra_env: dict[str, str] | None = None) -> Tuple[TestClient, Path]:
        return _configure_environment(monkeypatch, tmp_path, extra_env)

    return factory


def test_full_conversion_flow_creates_downloadable_musicxml(
    client_factory: Callable[[dict[str, str] | None], Tuple[TestClient, Path]]
) -> None:
    """El endpoint principal debe devolver una URL de descarga funcional."""

    test_client, results_dir = client_factory()

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


def test_custom_processing_mode_and_extra_arguments(
    client_factory: Callable[[dict[str, str] | None], Tuple[TestClient, Path]]
) -> None:
    """El backend debe aplicar el modo de procesamiento indicado."""

    test_client, results_dir = client_factory()

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


def test_invalid_processing_mode_returns_error(
    client_factory: Callable[[dict[str, str] | None], Tuple[TestClient, Path]]
) -> None:
    """Debe devolver un error claro cuando se envía un modo desconocido."""

    test_client, _ = client_factory()

    file_content = b"\x89PNG\r\n\x1a\n" + b"data"
    files = {"file": ("partitura.png", file_content, "image/png")}
    data = {"processing_mode": "experimental"}

    response = test_client.post("/api/omr", files=files, data=data)

    assert response.status_code == 422
    payload = response.json()
    assert payload["status"] == "error"
    assert "modos permitidos" in payload["message"].lower()


def test_pdf_page_selection_is_reflected_in_response(
    client_factory: Callable[[dict[str, str] | None], Tuple[TestClient, Path]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Procesar un PDF multipágina devuelve la página solicitada y el total detectado."""

    test_client, results_dir = client_factory()

    import tempfile

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_pdf:
        tmp_pdf.write(b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF")
        fake_page_path = Path(tmp_pdf.name)

    def fake_extract_pdf_page(input_path: Path, page: int | None):
        return fake_page_path, 2, 3

    monkeypatch.setattr(
        "app.services.omr._extract_pdf_page", fake_extract_pdf_page
    )

    files = {"file": ("partitura.pdf", b"%PDF-1.4 fake", "application/pdf")}
    data = {"page": "2"}

    response = test_client.post("/api/omr", files=files, data=data)

    assert response.status_code == 200
    payload = response.json()

    assert payload["page_number"] == 2
    assert payload["total_pages"] == 3

    stored_file = results_dir / f"{payload['result_id']}.musicxml"
    assert stored_file.exists()
    contents = stored_file.read_text(encoding="utf-8")
    assert "Página solicitada: 2" in contents
    fake_page_path.unlink(missing_ok=True)


def test_public_base_url_override_is_respected(
    client_factory: Callable[[dict[str, str] | None], Tuple[TestClient, Path]]
) -> None:
    """Cuando se indica una URL pública personalizada debe usarse en la respuesta."""

    custom_base = "https://backend.example.com"
    test_client, _ = client_factory({"OMR_PUBLIC_BASE_URL": custom_base})

    file_content = b"\x89PNG\r\n\x1a\n" + b"data"
    files = {"file": ("partitura.png", file_content, "image/png")}

    response = test_client.post("/api/omr", files=files)

    assert response.status_code == 200
    payload = response.json()
    assert payload["musicxml_url"].startswith(
        f"{custom_base}/api/files/musicxml/"
    )


def test_download_unknown_result_returns_404(
    client_factory: Callable[[dict[str, str] | None], Tuple[TestClient, Path]]
) -> None:
    """Descargar un identificador inexistente debe responder con 404."""

    test_client, _ = client_factory()

    response = test_client.get("/api/files/musicxml/desconocido")

    assert response.status_code == 404
    payload = response.json()
    assert payload["status"] == "error"
