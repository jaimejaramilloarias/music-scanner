"""Configuración de la aplicación y utilidades relacionadas."""

from functools import lru_cache
import shlex
from pathlib import Path
from typing import List, Optional

from pydantic import AnyHttpUrl, validator
from pydantic_settings import BaseSettings


BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Define la configuración del backend cargada desde variables de entorno."""

    allowed_origins: List[AnyHttpUrl] = [
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "https://usuario.github.io",
    ]
    public_base_url: AnyHttpUrl = "http://localhost:8000"
    results_dir: Path = BASE_DIR / "output"
    audiveris_command: Optional[List[str]] = None
    audiveris_timeout: int = 300
    enable_stub_omr: bool = True

    class Config:
        env_prefix = "omr_"
        env_file = ".env"

    @validator("allowed_origins", pre=True)
    def parse_allowed_origins(cls, value):  # type: ignore[override]
        """Permite definir los orígenes como cadena separada por comas."""
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @validator("audiveris_command", pre=True)
    def parse_audiveris_command(cls, value):  # type: ignore[override]
        """Permite indicar el comando de Audiveris como cadena única."""
        if value in (None, ""):
            return None
        if isinstance(value, str):
            return shlex.split(value)
        return value

    @validator("results_dir", pre=True)
    def ensure_results_dir(cls, value):  # type: ignore[override]
        """Convierte la ruta de resultados a ``Path``."""
        if isinstance(value, Path):
            return value
        return Path(str(value)).expanduser()


@lru_cache()
def get_settings() -> Settings:
    """Devuelve una instancia cacheada de la configuración."""

    return Settings()


settings = get_settings()
