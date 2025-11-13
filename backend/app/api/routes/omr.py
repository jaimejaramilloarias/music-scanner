"""Endpoints relacionados con el procesamiento OMR."""

from pathlib import Path
import tempfile

from fastapi import APIRouter, File, HTTPException, UploadFile, status

router = APIRouter(tags=["omr"])


@router.post("/omr", summary="Recibir un archivo para procesamiento OMR")
async def receive_score(file: UploadFile = File(...)) -> dict[str, object]:
    """Recibe un archivo del frontend y lo almacena temporalmente."""

    if file.filename is None or not file.filename.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo recibido no tiene un nombre válido.",
        )

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo recibido está vacío.",
        )

    suffix = Path(file.filename).suffix or ".tmp"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
        tmp_file.write(file_bytes)
        temp_path = Path(tmp_file.name)

    return {
        "status": "received",
        "filename": file.filename,
        "size": len(file_bytes),
        "stored_path": str(temp_path),
    }
