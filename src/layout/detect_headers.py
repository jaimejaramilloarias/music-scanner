"""Detection helpers for page margins and textual headers."""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Tuple

import cv2
import numpy as np


@dataclass(frozen=True)
class HeaderRegion:
    """Represents a detected textual header region."""

    bbox: Tuple[int, int, int, int]
    confidence: float


def _to_grayscale(image: np.ndarray) -> np.ndarray:
    if image.ndim == 3:
        return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return image.copy()


def estimate_page_margins(image: np.ndarray, *, threshold: int = 245) -> Tuple[int, int, int, int]:
    """Estimate page margins by analysing empty borders.

    The function assumes the score uses a light background (white or off-white).
    Pixels darker than ``threshold`` are considered content.  The returned tuple
    follows the ``(top, bottom, left, right)`` order and is expressed in pixels.
    """

    gray = _to_grayscale(image)
    content_mask = gray < threshold

    rows = np.where(content_mask.any(axis=1))[0]
    cols = np.where(content_mask.any(axis=0))[0]

    if rows.size == 0 or cols.size == 0:
        height, width = gray.shape[:2]
        return height, height, width, width

    top_margin = int(rows[0])
    bottom_margin = int(gray.shape[0] - rows[-1] - 1)
    left_margin = int(cols[0])
    right_margin = int(gray.shape[1] - cols[-1] - 1)
    return top_margin, bottom_margin, left_margin, right_margin


def detect_header_regions(
    image: np.ndarray,
    *,
    max_header_ratio: float = 0.2,
    min_confidence: float = 0.3,
) -> List[HeaderRegion]:
    """Detect header-like blobs located near the top margin.

    Parameters
    ----------
    image:
        Input page image in either grayscale or BGR order.
    max_header_ratio:
        Portion of the page height that can be considered a header band.
    min_confidence:
        Minimum ratio of foreground pixels required for the blob to be accepted
        as a textual header.
    """

    gray = _to_grayscale(image)
    height, width = gray.shape[:2]
    header_band_height = max(1, int(round(height * max_header_ratio)))

    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    header_band = binary[:header_band_height]

    if header_band.size == 0:
        return []

    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(header_band, connectivity=8)

    regions: List[HeaderRegion] = []
    for label in range(1, num_labels):
        x, y, w, h, area = stats[label]
        if area == 0:
            continue
        bbox = (int(x), int(y), int(x + w), int(y + h))
        blob = header_band[y : y + h, x : x + w]
        confidence = float(np.count_nonzero(blob) / blob.size)
        if confidence < min_confidence:
            continue
        regions.append(HeaderRegion(bbox=bbox, confidence=confidence))

    regions.sort(key=lambda region: region.bbox[1])
    return regions
