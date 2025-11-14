from __future__ import annotations

import math

import numpy as np

from src.layout import (
    StaffReference,
    compute_staff_line_paths,
    compute_staff_reference,
    enhance_staff_lines,
    extract_staff_line_mask,
    rectify_staff_region,
    rectify_staff_region_with_mask,
)


def _generate_warped_staff(
    width: int = 160,
    height: int = 120,
    *,
    amplitude: float = 3.5,
    period: float = 60.0,
    baseline: int = 40,
    spacing: int = 6,
) -> np.ndarray:
    image = np.full((height, width), 255, dtype=np.uint8)
    xs = np.arange(width)
    for line_index in range(5):
        offset = baseline + line_index * spacing
        curve = offset + amplitude * np.sin(2 * math.pi * xs / period + line_index * 0.4)
        for x, y in enumerate(curve):
            y_int = int(round(y))
            image[max(0, y_int - 1) : min(height, y_int + 2), max(0, x - 1) : min(width, x + 2)] = 0
    return image


def _compute_max_deviation(
    line_paths: np.ndarray,
    reference: StaffReference,
) -> float:
    deltas = np.abs(line_paths - reference.canonical_positions[:, None])
    return float(np.max(deltas))


def test_compute_staff_reference_estimates_spacing():
    image = _generate_warped_staff()
    mask = extract_staff_line_mask(image)
    line_paths = compute_staff_line_paths(mask)
    reference = compute_staff_reference(line_paths)
    assert abs(reference.line_spacing - 6.0) < 0.25
    assert reference.canonical_positions.shape == (5,)


def test_rectify_staff_region_reduces_max_deviation():
    image = _generate_warped_staff()
    mask = extract_staff_line_mask(image)
    line_paths = compute_staff_line_paths(mask)
    reference = compute_staff_reference(line_paths)
    before = _compute_max_deviation(line_paths, reference)

    rectified, rectified_reference, rectified_mask = rectify_staff_region_with_mask(image, mask)
    rectified_paths = compute_staff_line_paths(rectified_mask)
    after = _compute_max_deviation(rectified_paths, rectified_reference)

    assert after < 1.1
    assert after < before / 3


def test_enhance_staff_lines_increases_dark_pixel_count():
    image = _generate_warped_staff()
    enhanced = enhance_staff_lines(image, kernel_width=7)
    dark_before = int(np.count_nonzero(image < 64))
    dark_after = int(np.count_nonzero(enhanced < 64))
    assert dark_after > dark_before
