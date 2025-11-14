from __future__ import annotations

from pathlib import Path

import numpy as np

from src.layout import (
    detect_header_regions,
    estimate_page_margins,
    extract_staff_line_mask,
    find_staff_regions,
    group_staff_regions,
)

FIXTURES_DIR = Path(__file__).parent.parent / "fixtures" / "layout"


def _generate_synthetic_score(width: int = 120, height: int = 96) -> np.ndarray:
    image = np.full((height, width), 255, dtype=np.uint8)

    # Header text block
    image[4:12, 15:width - 15] = 60

    # Two systems with five staff lines each
    staff_x0, staff_x1 = 10, width - 10
    first_staff_y = 28
    second_staff_y = 54
    line_spacing = 4

    for base_y in (first_staff_y, second_staff_y):
        for line in range(5):
            y = base_y + line * line_spacing
            image[y : y + 1, staff_x0:staff_x1] = 0

    return image


def _load_mask_fixture(name: str) -> np.ndarray:
    path = FIXTURES_DIR / name
    rows = []
    for line in path.read_text().splitlines():
        rows.append([255 if char == "#" else 0 for char in line.strip()])
    return np.array(rows, dtype=np.uint8)


def test_estimate_page_margins_detects_header_band():
    image = _generate_synthetic_score()
    top, bottom, left, right = estimate_page_margins(image)
    assert top == 4
    assert bottom == 25
    assert left == 10
    assert right == 10


def test_detect_header_regions_returns_single_header():
    image = _generate_synthetic_score()
    regions = detect_header_regions(image)
    assert len(regions) == 1
    bbox = regions[0].bbox
    assert bbox[0] <= 15
    assert bbox[2] >= image.shape[1] - 15
    assert bbox[1] <= 4
    assert bbox[3] >= 11
    assert 0.5 <= regions[0].confidence <= 1.0


def test_extract_staff_line_mask_matches_fixture():
    image = _generate_synthetic_score()
    mask = extract_staff_line_mask(image)
    expected = _load_mask_fixture("double_system_mask.txt")
    assert mask.shape == expected.shape
    assert np.array_equal(mask, expected)


def test_find_staff_regions_detects_two_groups():
    image = _generate_synthetic_score()
    regions = find_staff_regions(image)
    assert len(regions) == 2
    assert regions[0].top < regions[1].top
    assert regions[0].bottom < regions[1].top


def test_group_staff_regions_splits_systems():
    image = _generate_synthetic_score()
    regions = find_staff_regions(image)
    systems = group_staff_regions(regions, max_vertical_gap=10)
    assert len(systems) == 2
    assert all(len(system) == 1 for system in systems)
    assert systems[0][0].top < systems[1][0].top
