"""Inicialización de la aplicación FastAPI para el backend OMR."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import include_routers
from .core import settings


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

    include_routers(app)
    return app
