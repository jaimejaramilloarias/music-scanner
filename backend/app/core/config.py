"""Configuración de la aplicación y utilidades relacionadas."""

from functools import lru_cache
import json
import shlex
from pathlib import Path
from typing import Dict, List, Optional

from pydantic import AnyHttpUrl, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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
    default_processing_mode: str = "auto"
    audiveris_processing_presets: Dict[str, List[str]] = {
        "auto": [],
        "printed": [],
        "handwritten": [],
    }

    model_config = SettingsConfigDict(
        env_prefix="omr_",
        env_file=".env",
    )

    @field_validator("allowed_origins", mode="before")
    def parse_allowed_origins(cls, value):
        """Permite definir los orígenes como cadena separada por comas."""
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("audiveris_command", mode="before")
    def parse_audiveris_command(cls, value):
        """Permite indicar el comando de Audiveris como cadena única."""
        if value in (None, ""):
            return None
        if isinstance(value, str):
            return shlex.split(value)
        return value

    @field_validator("results_dir", mode="before")
    def ensure_results_dir(cls, value):
        """Convierte la ruta de resultados a ``Path``."""
        if isinstance(value, Path):
            return value
        return Path(str(value)).expanduser()

    @field_validator("default_processing_mode", mode="before")
    def normalize_default_mode(cls, value):
        """Normaliza el modo por defecto a minúsculas."""
        if value in (None, ""):
            return "auto"
        return str(value).strip().lower()

    @field_validator("audiveris_processing_presets", mode="before")
    def parse_processing_presets(cls, value):
        """Permite definir los presets como JSON o diccionario."""
        if value in (None, "", {}):
            return {
                "auto": [],
                "printed": [],
                "handwritten": [],
            }

        if isinstance(value, str):
            try:
                parsed = json.loads(value)
            except json.JSONDecodeError as exc:  # pragma: no cover - configuración inválida
                raise ValueError(
                    "OMR_AUDIVERIS_PROCESSING_PRESETS debe ser un objeto JSON válido.",
                ) from exc
        elif isinstance(value, dict):
            parsed = value
        else:  # pragma: no cover - tipos no contemplados
            raise TypeError(
                "Los presets de procesamiento deben indicarse como JSON o diccionario.",
            )

        sanitized: Dict[str, List[str]] = {}
        for raw_key, raw_args in parsed.items():
            key = str(raw_key).strip().lower()
            if not key:
                continue

            if isinstance(raw_args, str):
                args_list = [arg for arg in shlex.split(raw_args) if arg]
            elif isinstance(raw_args, (list, tuple, set)):
                args_list = [str(arg).strip() for arg in raw_args if str(arg).strip()]
            else:  # pragma: no cover - tipos no contemplados
                raise ValueError(
                    "Cada preset debe ser una cadena o una lista de argumentos.",
                )

            sanitized[key] = args_list

        if "auto" not in sanitized:
            sanitized["auto"] = []

        return sanitized

    @model_validator(mode="after")
    def ensure_default_mode_in_presets(self):
        """Garantiza que el modo por defecto exista entre los presets configurados."""

        if self.default_processing_mode not in self.audiveris_processing_presets:
            available = ", ".join(sorted(self.audiveris_processing_presets))
            raise ValueError(
                "El modo por defecto configurado no existe en los presets disponibles. "
                f"Modos configurados: {available or 'ninguno'}.",
            )

        return self

    @property
    def available_processing_modes(self) -> List[str]:
        """Devuelve la lista de modos de procesamiento configurados."""

        return list(self.audiveris_processing_presets.keys())


@lru_cache()
def get_settings() -> Settings:
    """Devuelve una instancia cacheada de la configuración."""

    return Settings()


settings = get_settings()
