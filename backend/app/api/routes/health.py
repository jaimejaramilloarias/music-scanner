"""Endpoints de salud y diagnóstico."""

from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health", summary="Comprobar el estado del servicio")
def healthcheck() -> dict[str, str]:
    """Devuelve un estado básico del servicio."""
    return {"status": "ok"}
