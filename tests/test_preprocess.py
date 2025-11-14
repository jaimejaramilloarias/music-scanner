from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from src.preprocess.normalize import (
    DEFAULT_DPI,
    deskew_image,
    detect_skew_angle,
    iter_normalised_images,
    normalize_image_dpi,
)

FIXTURES = Path(__file__).parent / "fixtures" / "preprocess"


def test_normalize_image_dpi_rescales_dimensions(tmp_path):
    image = np.zeros((50, 100, 3), dtype=np.uint8)
    current_dpi = 150
    target_dpi = 300

    scaled = normalize_image_dpi(image, current_dpi=current_dpi, target_dpi=target_dpi)

    assert scaled.shape[:2] == (100, 200)


def test_deskew_image_recovers_orientation():
    # Create a synthetic image containing staff-like horizontal lines
    image = np.full((200, 200), 255, dtype=np.uint8)
    for y in range(50, 151, 25):
        cv2.line(image, (20, y), (180, y), color=0, thickness=2)

    rotation_matrix = cv2.getRotationMatrix2D((100, 100), -8, 1.0)
    rotated = cv2.warpAffine(image, rotation_matrix, (200, 200), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)

    initial_angle = detect_skew_angle(rotated)
    corrected, applied_angle = deskew_image(rotated)
    residual_angle = detect_skew_angle(corrected)

    assert abs(initial_angle) > 1
    assert abs(applied_angle) > 1
    assert abs(residual_angle) < 1
    assert abs(residual_angle) < abs(initial_angle)


def test_iter_normalised_images_reads_pgm_fixture(tmp_path):
    pgm_path = FIXTURES / "noisy_staff.pgm"
    images = list(iter_normalised_images(pgm_path, target_dpi=DEFAULT_DPI))
    assert len(images) == 1
    assert images[0].shape[:2] == (10, 10)


def test_pdf_conversion_generates_images(tmp_path):
    # Generate a simple image and export it as PDF at runtime
    img = Image.new("RGB", (32, 32), color=(255, 255, 255))
    for y in range(5, 27, 6):
        for x in range(2, 30):
            img.putpixel((x, y), (0, 0, 0))
    pdf_path = tmp_path / "sample.pdf"
    img.save(pdf_path, "PDF", resolution=150)

    try:
        images = list(iter_normalised_images(pdf_path, target_dpi=150))
    except RuntimeError as exc:
        import pytest

        pytest.skip(f"PDF support is not available: {exc}")
    assert len(images) >= 1
    height, width = images[0].shape[:2]
    assert height == img.height and width == img.width
