"""Staff line detection and grouping utilities."""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Sequence

import cv2
import numpy as np


@dataclass(frozen=True)
class StaffRegion:
    """Container describing a detected staff region."""

    top: int
    bottom: int
    left: int
    right: int

    def to_slice(self) -> tuple[slice, slice]:
        return slice(self.top, self.bottom), slice(self.left, self.right)


def _ensure_grayscale(image: np.ndarray) -> np.ndarray:
    if image.ndim == 3:
        return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return image.copy()


def extract_staff_line_mask(
    image: np.ndarray,
    *,
    horizontal_kernel_ratio: float = 0.15,
    min_line_length: int | None = None,
) -> np.ndarray:
    """Return a binary mask highlighting horizontal staff lines."""

    gray = _ensure_grayscale(image)
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    width = gray.shape[1]
    kernel_length = int(max(5, round(width * horizontal_kernel_ratio)))
    if min_line_length is not None:
        kernel_length = max(kernel_length, min_line_length)
    horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_length, 1))

    detected = cv2.erode(binary, horizontal_kernel, iterations=1)
    detected = cv2.dilate(detected, horizontal_kernel, iterations=1)
    return detected


def _dilate_for_grouping(mask: np.ndarray, *, band_height: int = 9) -> np.ndarray:
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, band_height))
    dilated = cv2.dilate(mask, kernel, iterations=1)
    dilated = cv2.erode(dilated, kernel, iterations=1)
    return dilated


def find_staff_regions(
    image: np.ndarray,
    *,
    band_height: int = 11,
    min_area: int = 100,
    ignore_top_ratio: float = 0.1,
) -> List[StaffRegion]:
    """Detect staff regions from the provided image."""

    mask = extract_staff_line_mask(image)
    grouped = _dilate_for_grouping(mask, band_height=band_height)
    num_labels, _, stats, _ = cv2.connectedComponentsWithStats(grouped, connectivity=8)

    regions: List[StaffRegion] = []
    height = mask.shape[0]
    top_cutoff = int(round(height * ignore_top_ratio))
    for label in range(1, num_labels):
        x, y, w, h, area = stats[label]
        if area < min_area:
            continue
        top = int(y)
        bottom = int(y + h)
        if bottom <= top_cutoff:
            continue
        regions.append(StaffRegion(top=top, bottom=bottom, left=int(x), right=int(x + w)))

    regions.sort(key=lambda region: (region.top, region.left))
    return regions


def group_staff_regions(
    regions: Sequence[StaffRegion],
    *,
    max_vertical_gap: int = 25,
) -> List[List[StaffRegion]]:
    """Group staff regions into systems based on their vertical proximity."""

    if not regions:
        return []

    sorted_regions = sorted(regions, key=lambda region: region.top)
    systems: List[List[StaffRegion]] = [[sorted_regions[0]]]

    for region in sorted_regions[1:]:
        last_system = systems[-1]
        previous = last_system[-1]
        gap = region.top - previous.bottom
        if gap <= max_vertical_gap:
            last_system.append(region)
        else:
            systems.append([region])

    return systems
