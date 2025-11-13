"""Endpoints relacionados con el procesamiento OMR."""

from pathlib import Path
import tempfile

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from app.core import settings
from app.services import OMRProcessingError, run_omr, resolve_musicxml_path

router = APIRouter(tags=["omr"])

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".pdf"}
#: Extensiones de archivo admitidas para el procesamiento OMR.

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
#: Tamaño máximo permitido (en bytes) para los archivos recibidos.


@router.post("/omr", summary="Procesa una partitura y devuelve la URL del MusicXML")
async def process_score(file: UploadFile = File(...)) -> dict[str, object]:
    """Recibe un archivo del frontend, ejecuta OMR y genera un enlace de descarga."""

    if file.filename is None or not file.filename.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo recibido no tiene un nombre válido.",
        )

    extension = Path(file.filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato de archivo no soportado. Usa PNG, JPG, JPEG o PDF.",
        )

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo recibido está vacío.",
        )

    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="El archivo supera el tamaño máximo permitido de 10 MB.",
        )

    suffix = extension or ".tmp"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
        tmp_file.write(file_bytes)
        temp_path = Path(tmp_file.name)

    try:
        result = run_omr(temp_path)
    except OMRProcessingError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc
    finally:
        temp_path.unlink(missing_ok=True)

    base_url = settings.public_base_url.rstrip("/")
    musicxml_url = f"{base_url}/api/files/musicxml/{result.result_id}"

    return {
        "status": "ok",
        "musicxml_url": musicxml_url,
        "result_id": result.result_id,
        "original_filename": file.filename,
    }


@router.get(
    "/files/musicxml/{result_id}",
    summary="Devuelve el archivo MusicXML generado para una partitura procesada",
)
async def download_musicxml(result_id: str) -> FileResponse:
    """Permite descargar el archivo MusicXML generado previamente."""

    try:
        file_path = resolve_musicxml_path(result_id)
    except FileNotFoundError as exc:  # pragma: no cover - FastAPI gestiona las respuestas
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No se encontró un resultado con el identificador indicado.",
        ) from exc

    return FileResponse(
        file_path,
        media_type="application/vnd.recordare.musicxml+xml",
        filename=f"{result_id}.musicxml",
    )
