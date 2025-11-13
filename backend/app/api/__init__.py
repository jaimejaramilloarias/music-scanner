"""Registro de routers de la API."""

from fastapi import FastAPI

from .routes import health


def include_routers(app: FastAPI) -> None:
    """Incluye los routers principales en la aplicación."""
    app.include_router(health.router, prefix="/api")
