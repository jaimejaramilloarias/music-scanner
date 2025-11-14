"""Utilities to rectify warped staff lines and enhance their contrast."""
from __future__ import annotations

from dataclasses import dataclass
from itertools import combinations
from typing import Iterable

import cv2
import numpy as np


def _ensure_grayscale(image: np.ndarray) -> np.ndarray:
    if image.ndim == 3:
        return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return image.copy()


def _smooth_curve(curve: np.ndarray, window: int) -> np.ndarray:
    if window <= 1:
        return curve
    window = int(max(1, window - (window % 2 == 0)))
    radius = window // 2
    padded = np.pad(curve, (radius, radius), mode="edge")
    kernel = np.full(window, 1.0 / window, dtype=np.float32)
    smoothed = np.convolve(padded, kernel, mode="valid")
    return smoothed.astype(np.float32)


def _extract_column_centers(column: np.ndarray) -> list[int]:
    ys = np.flatnonzero(column)
    if ys.size == 0:
        return []
    segments: list[tuple[int, int]] = []
    start = ys[0]
    prev = ys[0]
    for value in ys[1:]:
        if value != prev + 1:
            segments.append((start, prev))
            start = value
        prev = value
    segments.append((start, prev))
    return [int(round((s + e) / 2)) for s, e in segments]


def compute_staff_line_paths(
    mask: np.ndarray,
    *,
    expected_lines: int = 5,
    smoothing_window: int = 9,
) -> np.ndarray:
    """Trace the vertical position of each staff line across the image width."""

    if mask.ndim != 2:
        raise ValueError("Mask must be a 2-D array")

    binary = (mask > 0).astype(np.uint8)
    if not np.any(binary):
        raise ValueError("Mask does not contain staff lines")

    height, width = binary.shape
    if expected_lines <= 0:
        raise ValueError("expected_lines must be positive")

    centers_by_column = [_extract_column_centers(binary[:, x]) for x in range(width)]
    if not any(centers_by_column):
        raise ValueError("Mask does not contain staff lines")

    line_paths = np.full((expected_lines, width), np.nan, dtype=np.float32)
    previous: list[float] | None = None

    for x, centers in enumerate(centers_by_column):
        if len(centers) >= expected_lines:
            best_combo = None
            best_cost = None
            for combo in combinations(centers, expected_lines):
                sorted_combo = sorted(combo)
                if previous is not None:
                    cost = sum((sorted_combo[i] - previous[i]) ** 2 for i in range(expected_lines))
                else:
                    cost = 0.0
                if best_cost is None or cost < best_cost:
                    best_cost = cost
                    best_combo = sorted_combo
            assert best_combo is not None
            line_paths[:, x] = np.array(best_combo, dtype=np.float32)
            previous = list(best_combo)
        elif previous is not None:
            line_paths[:, x] = np.array(previous, dtype=np.float32)
        else:
            continue

    if previous is None:
        raise ValueError("Insufficient staff lines detected in mask")

    for line_idx in range(expected_lines):
        column_mask = ~np.isnan(line_paths[line_idx])
        if not np.any(column_mask):
            raise ValueError("Unable to trace staff line")
        valid_x = np.where(column_mask)[0]
        valid_y = line_paths[line_idx, column_mask]
        line_paths[line_idx] = np.interp(np.arange(width), valid_x, valid_y)

    if smoothing_window > 1:
        for idx in range(line_paths.shape[0]):
            line_paths[idx] = _smooth_curve(line_paths[idx], smoothing_window)

    return line_paths


@dataclass(frozen=True)
class StaffReference:
    """Reference information about staff geometry."""

    canonical_positions: np.ndarray
    line_spacing: float


def compute_staff_reference(line_paths: np.ndarray) -> StaffReference:
    if line_paths.ndim != 2:
        raise ValueError("line_paths must be a 2-D array")
    if line_paths.shape[0] < 2:
        raise ValueError("At least two lines are required to compute spacing")

    median_positions = np.median(line_paths, axis=1)
    spacing_samples = []
    for idx in range(line_paths.shape[0] - 1):
        spacing_samples.extend(np.abs(line_paths[idx + 1] - line_paths[idx]))
    line_spacing = float(np.median(spacing_samples))
    first_line = float(median_positions[0])
    canonical_positions = first_line + np.arange(line_paths.shape[0], dtype=np.float32) * line_spacing
    return StaffReference(canonical_positions=canonical_positions, line_spacing=line_spacing)


def _build_rectification_map(
    line_paths: np.ndarray,
    reference: StaffReference,
    height: int,
) -> tuple[np.ndarray, np.ndarray]:
    width = line_paths.shape[1]
    map_x = np.tile(np.arange(width, dtype=np.float32), (height, 1))
    map_y = np.zeros((height, width), dtype=np.float32)
    spacing = reference.line_spacing

    extended_reference = np.concatenate(
        (
            [reference.canonical_positions[0] - spacing],
            reference.canonical_positions,
            [reference.canonical_positions[-1] + spacing],
        )
    )

    for x in range(width):
        positions = line_paths[:, x]
        extended_positions = np.concatenate(
            (
                [max(0.0, positions[0] - spacing)],
                positions,
                [min(float(height - 1), positions[-1] + spacing)],
            )
        )

        for y in range(height):
            idx = np.searchsorted(extended_reference, y, side="right") - 1
            idx = int(np.clip(idx, 0, len(extended_reference) - 2))
            dst_start, dst_end = extended_reference[idx], extended_reference[idx + 1]
            src_start, src_end = extended_positions[idx], extended_positions[idx + 1]
            if dst_end == dst_start:
                map_y[y, x] = src_start
            else:
                ratio = (y - dst_start) / (dst_end - dst_start)
                map_y[y, x] = src_start + ratio * (src_end - src_start)

    return map_x, map_y


def rectify_staff_region(
    image: np.ndarray,
    mask: np.ndarray,
    *,
    expected_lines: int = 5,
    smoothing_window: int = 5,
    interpolation: int = cv2.INTER_LINEAR,
) -> tuple[np.ndarray, StaffReference]:
    """Warp a staff region so that staff lines become horizontal."""

    gray = _ensure_grayscale(image)
    line_paths = compute_staff_line_paths(
        mask,
        expected_lines=expected_lines,
        smoothing_window=smoothing_window,
    )
    reference = compute_staff_reference(line_paths)
    map_x, map_y = _build_rectification_map(line_paths, reference, gray.shape[0])
    rectified = cv2.remap(gray, map_x, map_y, interpolation, borderMode=cv2.BORDER_REPLICATE)
    return rectified, reference


def rectify_staff_region_with_mask(
    image: np.ndarray,
    mask: np.ndarray,
    *,
    expected_lines: int = 5,
    smoothing_window: int = 5,
    interpolation: int = cv2.INTER_LINEAR,
) -> tuple[np.ndarray, StaffReference, np.ndarray]:
    """Rectify both the image and its binary mask."""

    gray = _ensure_grayscale(image)
    line_paths = compute_staff_line_paths(
        mask,
        expected_lines=expected_lines,
        smoothing_window=smoothing_window,
    )
    reference = compute_staff_reference(line_paths)
    map_x, map_y = _build_rectification_map(line_paths, reference, gray.shape[0])
    rectified = cv2.remap(gray, map_x, map_y, interpolation, borderMode=cv2.BORDER_REPLICATE)
    warped_mask = cv2.remap(
        (mask > 0).astype(np.uint8) * 255,
        map_x,
        map_y,
        cv2.INTER_NEAREST,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=0,
    )
    return rectified, reference, warped_mask


def enhance_staff_lines(
    image: np.ndarray,
    *,
    kernel_width: int = 5,
    iterations: int = 1,
) -> np.ndarray:
    """Increase the contrast and thickness of staff lines using morphology."""

    gray = _ensure_grayscale(image)
    equalized = cv2.equalizeHist(gray)
    inverted = cv2.bitwise_not(equalized)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_width, 1))
    dilated = cv2.dilate(inverted, kernel, iterations=iterations)
    enhanced = cv2.bitwise_not(dilated)
    normalized = cv2.normalize(enhanced, None, alpha=0, beta=255, norm_type=cv2.NORM_MINMAX)
    return normalized


def batch_rectify(
    staffs: Iterable[tuple[np.ndarray, np.ndarray]],
    *,
    expected_lines: int = 5,
    smoothing_window: int = 5,
) -> list[tuple[np.ndarray, StaffReference]]:
    """Rectify multiple staff regions and return their rectified images and references."""

    results: list[tuple[np.ndarray, StaffReference]] = []
    for image, mask in staffs:
        rectified, reference = rectify_staff_region(
            image,
            mask,
            expected_lines=expected_lines,
            smoothing_window=smoothing_window,
        )
        results.append((rectified, reference))
    return results


__all__ = [
    "StaffReference",
    "batch_rectify",
    "compute_staff_line_paths",
    "compute_staff_reference",
    "enhance_staff_lines",
    "rectify_staff_region",
    "rectify_staff_region_with_mask",
]

