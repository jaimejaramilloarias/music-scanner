"""Input ingestion helpers for the OMR pipeline."""
from __future__ import annotations

from pathlib import Path
from typing import List

import cv2
import numpy as np

from ..preprocess.normalize import (
    DEFAULT_DPI,
    PreprocessConfig,
    iter_normalised_images,
    load_image_with_metadata,
    preprocess_pipeline,
)


class UnsupportedFormatError(ValueError):
    """Raised when the user provides an unsupported file type."""


SUPPORTED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".pdf", ".pgm"}


def validate_source(path: Path) -> Path:
    """Validate and normalise the provided ``path``."""

    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(path)
    if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise UnsupportedFormatError(f"Unsupported input format: {path.suffix}")
    return path


def load_input_images(path: Path, *, target_dpi: int = 300) -> List[np.ndarray]:
    """Load every page contained in ``path`` without additional preprocessing."""

    path = validate_source(path)
    return [image for image in iter_normalised_images(path, target_dpi=target_dpi)]


def load_and_preprocess(path: Path, config: PreprocessConfig | None = None) -> List[np.ndarray]:
    """High level helper returning fully preprocessed images ready for analysis."""

    config = config or PreprocessConfig()
    raw_images = load_input_images(path, target_dpi=config.target_dpi)
    return [preprocess_pipeline(image, config=config) for image in raw_images]


def load_image_with_dpi(path: Path) -> np.ndarray:
    """Load a single image ensuring it matches :data:`DEFAULT_DPI`."""

    image, current_dpi = load_image_with_metadata(path)
    if current_dpi == DEFAULT_DPI or np.isclose(current_dpi, DEFAULT_DPI):
        return image
    scale = DEFAULT_DPI / current_dpi
    height, width = image.shape[:2]
    new_size = (int(round(width * scale)), int(round(height * scale)))
    return cv2.resize(image, new_size)
