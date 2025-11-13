"""Configuración de la aplicación y utilidades relacionadas."""

from functools import lru_cache
from typing import List

from pydantic import AnyHttpUrl, validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Define la configuración del backend cargada desde variables de entorno."""

    allowed_origins: List[AnyHttpUrl] = [
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "https://usuario.github.io",
    ]

    class Config:
        env_prefix = "omr_"
        env_file = ".env"

    @validator("allowed_origins", pre=True)
    def parse_allowed_origins(cls, value):  # type: ignore[override]
        """Permite definir los orígenes como cadena separada por comas."""
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache()
def get_settings() -> Settings:
    """Devuelve una instancia cacheada de la configuración."""

    return Settings()


settings = get_settings()
