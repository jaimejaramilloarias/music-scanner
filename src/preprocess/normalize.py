"""Preprocessing utilities for the OMR pipeline.

This module centralises operations that prepare a score image before it
reaches the symbol detection stages.  The main responsibilities are:

* converting PDF files into page images,
* normalising the DPI of any incoming image,
* compensating for skew using OpenCV, and
* applying a configurable preprocessing pipeline (denoise, illumination
  correction and adaptive binarisation).

The functions are intentionally small and composable so that higher level
pipelines can pick the ones that make sense for their context.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Tuple

import cv2
import numpy as np
from PIL import Image, ImageSequence, UnidentifiedImageError

# Default DPI used when the source image does not specify one.
DEFAULT_DPI = 72


@dataclass
class PreprocessConfig:
    """Configuration container for the preprocessing pipeline."""

    target_dpi: int = 300
    denoise_strength: float = 10.0
    adaptive_block_size: int = 35
    adaptive_c: int = 10


def _pil_image_to_cv(image: Image.Image) -> np.ndarray:
    """Convert a PIL image to an OpenCV BGR ndarray."""

    return cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)


def convert_pdf_to_images(pdf_path: Path, target_dpi: int = 300) -> List[np.ndarray]:
    """Convert each page of a PDF into normalised BGR images.

    The function iterates through every page using ``ImageSequence`` so that we
    avoid loading the whole document in memory at once.  Each page is converted
    to RGB, scaled to the requested DPI and finally returned as a numpy array in
    BGR order to play nicely with OpenCV downstream.
    """

    images: List[np.ndarray] = []
    try:
        document = Image.open(pdf_path)
    except UnidentifiedImageError as exc:
        raise RuntimeError(f"Failed to open PDF {pdf_path}: {exc}") from exc
    with document as document:
        for page in ImageSequence.Iterator(document):
            # ``page.info.get("dpi")`` returns a tuple (x_dpi, y_dpi) when the
            # information is present; otherwise fall back to ``DEFAULT_DPI``.
            dpi_tuple = page.info.get("dpi", (DEFAULT_DPI, DEFAULT_DPI))
            current_dpi = int(np.mean(dpi_tuple))
            page = page.convert("RGB")
            cv_image = _pil_image_to_cv(page)
            normalised = normalize_image_dpi(cv_image, current_dpi=current_dpi, target_dpi=target_dpi)
            images.append(normalised)
    return images


def normalize_image_dpi(
    image: np.ndarray,
    *,
    current_dpi: int,
    target_dpi: int,
    interpolation: int | None = None,
) -> np.ndarray:
    """Rescale ``image`` so that it matches ``target_dpi``.

    Parameters
    ----------
    image:
        Image in BGR order.
    current_dpi:
        DPI reported by the input image.  When this information is unknown, the
        caller should use :data:`DEFAULT_DPI`.
    target_dpi:
        DPI expected by the rest of the pipeline.  Values below ``current_dpi``
        downscale the image while higher values upscale it.
    interpolation:
        Optional OpenCV interpolation flag.  If omitted, the function chooses an
        interpolation mode appropriate for upsampling or downsampling.
    """

    if current_dpi <= 0:
        raise ValueError("current_dpi must be a positive integer")
    if target_dpi <= 0:
        raise ValueError("target_dpi must be a positive integer")

    if target_dpi == current_dpi:
        return image.copy()

    scale = target_dpi / float(current_dpi)
    interpolation_mode = interpolation
    if interpolation_mode is None:
        interpolation_mode = cv2.INTER_CUBIC if scale > 1 else cv2.INTER_AREA

    new_width = max(1, int(round(image.shape[1] * scale)))
    new_height = max(1, int(round(image.shape[0] * scale)))
    return cv2.resize(image, (new_width, new_height), interpolation=interpolation_mode)


def detect_skew_angle(image: np.ndarray, *, delta: float = 1.0, limit: float = 15.0) -> float:
    """Estimate the skew angle (in degrees) of ``image``.

    The implementation combines a probabilistic Hough transform with line slope
    averaging to remain robust on both clean scans and noisy photographs.  The
    returned angle follows the OpenCV convention: positive values mean the image
    must be rotated counter-clockwise to correct the skew.
    """

    if image.ndim == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image

    gray = cv2.equalizeHist(gray)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    _, binary = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    lines_p = cv2.HoughLinesP(
        binary,
        1,
        np.deg2rad(delta),
        threshold=100,
        minLineLength=max(10, binary.shape[1] // 2),
        maxLineGap=20,
    )

    angles: List[float] = []
    if lines_p is not None:
        for line in lines_p[:100]:
            x1, y1, x2, y2 = line.reshape(4)
            angle = np.rad2deg(np.arctan2(y2 - y1, x2 - x1))
            if angle > 90:
                angle -= 180
            if angle < -90:
                angle += 180
            if -limit <= angle <= limit:
                angles.append(angle)

    if not angles:
        edges = cv2.Canny(binary, 50, 150, apertureSize=3)
        lines = cv2.HoughLines(edges, 1, np.deg2rad(delta), threshold=150)
        if lines is not None:
            for line in lines[:50]:
                _, theta = line[0]
                angle = np.rad2deg(theta)
                if angle > 90:
                    angle -= 180
                if angle < -90:
                    angle += 180
                if -limit <= angle <= limit:
                    angles.append(angle)

    if not angles:
        return 0.0
    return float(np.mean(angles))


def deskew_image(image: np.ndarray) -> Tuple[np.ndarray, float]:
    """Rotate ``image`` to compensate for its skew.

    Returns a tuple ``(corrected_image, applied_angle)`` where ``applied_angle``
    is expressed in degrees.  The value is positive when the image needed a
    counter-clockwise rotation.
    """

    angle = detect_skew_angle(image)
    if abs(angle) < 0.01:
        return image.copy(), 0.0

    if image.ndim == 3:
        height, width, _ = image.shape
    else:
        height, width = image.shape

    center = (width // 2, height // 2)
    rotation_matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
    corrected = cv2.warpAffine(image, rotation_matrix, (width, height), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    return corrected, angle


def denoise_image(image: np.ndarray, strength: float = 10.0) -> np.ndarray:
    """Apply a fast non-local means denoising to ``image``."""

    if image.ndim == 3:
        return cv2.fastNlMeansDenoisingColored(image, None, h=strength, hColor=strength, templateWindowSize=7, searchWindowSize=21)
    return cv2.fastNlMeansDenoising(image, None, h=strength, templateWindowSize=7, searchWindowSize=21)


def correct_illumination(image: np.ndarray) -> np.ndarray:
    """Perform a simple illumination correction using morphological operations."""

    if image.ndim == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image

    background = cv2.medianBlur(gray, 25)
    background = np.clip(background, 1, 255)
    normalized = cv2.divide(gray, background, scale=255)
    return normalized


def adaptive_binarize(image: np.ndarray, block_size: int = 35, c: int = 10) -> np.ndarray:
    """Apply adaptive thresholding to emphasise staff lines and symbols."""

    if block_size % 2 == 0:
        raise ValueError("block_size must be odd for adaptive thresholding")
    return cv2.adaptiveThreshold(image, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, block_size, c)


def preprocess_pipeline(image: np.ndarray, config: PreprocessConfig | None = None) -> np.ndarray:
    """Run the complete preprocessing pipeline for a single image."""

    config = config or PreprocessConfig()
    normalized = normalize_image_dpi(
        image,
        current_dpi=config.target_dpi,  # assume already close to desired DPI
        target_dpi=config.target_dpi,
    )
    deskewed, _ = deskew_image(normalized)
    denoised = denoise_image(deskewed, strength=config.denoise_strength)
    illumination = correct_illumination(denoised)
    binarized = adaptive_binarize(illumination, block_size=config.adaptive_block_size, c=config.adaptive_c)
    return binarized


def load_image_with_metadata(path: Path) -> Tuple[np.ndarray, int]:
    """Load an image returning both its pixel data and DPI."""

    with Image.open(path) as img:
        dpi = img.info.get("dpi", (DEFAULT_DPI, DEFAULT_DPI))
        current_dpi = int(np.mean(dpi))
        pil_img = img.convert("RGB")
        cv_img = _pil_image_to_cv(pil_img)
    return cv_img, current_dpi


def iter_normalised_images(path: Path, target_dpi: int = 300) -> Iterable[np.ndarray]:
    """Yield all images contained in ``path`` normalised to ``target_dpi``."""

    path = Path(path)
    if path.suffix.lower() == ".pdf":
        yield from convert_pdf_to_images(path, target_dpi=target_dpi)
        return

    image, current_dpi = load_image_with_metadata(path)
    yield normalize_image_dpi(image, current_dpi=current_dpi, target_dpi=target_dpi)
