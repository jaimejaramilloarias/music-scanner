"""Inicialización de la aplicación FastAPI para el backend OMR."""

from __future__ import annotations

import logging
from typing import Any, Dict

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api import include_routers
from .core import settings

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    """Crea y configura una instancia de la aplicación FastAPI."""
    app = FastAPI(title="OMR Webapp API", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(
        request: Request, exc: HTTPException
    ) -> JSONResponse:  # pragma: no cover - manejo de errores global
        payload = _format_error_payload(
            exc.detail,
            default_message="Se produjo un error al procesar la petición.",
        )
        return JSONResponse(
            status_code=exc.status_code,
            content=payload,
            headers=exc.headers,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:  # pragma: no cover - manejo de errores global
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "status": "error",
                "message": "Los datos enviados no son válidos. Revisa el archivo y vuelve a intentarlo.",
                "errors": exc.errors(),
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:  # pragma: no cover - manejo de errores global
        logger.exception("Error inesperado durante la petición", exc_info=exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "status": "error",
                "message": "Error interno del servidor. Inténtalo de nuevo más tarde.",
            },
        )

    include_routers(app)
    return app


def _format_error_payload(detail: Any, default_message: str) -> Dict[str, Any]:
    """Normaliza la estructura de las respuestas de error."""

    if isinstance(detail, dict):
        payload: Dict[str, Any] = {**detail}
        message = payload.get("message") or payload.get("detail") or default_message
        payload.pop("detail", None)
        payload["status"] = payload.get("status") or "error"
        payload["message"] = message
        return payload

    if isinstance(detail, list):
        return {
            "status": "error",
            "message": default_message,
            "errors": detail,
        }

    if isinstance(detail, str):
        return {"status": "error", "message": detail}

    return {"status": "error", "message": default_message}
