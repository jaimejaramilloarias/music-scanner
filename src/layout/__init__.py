"""Layout analysis utilities for staff segmentation and header detection."""

from .detect_headers import HeaderRegion, detect_header_regions, estimate_page_margins
from .staff_detection import (
    StaffRegion,
    extract_staff_line_mask,
    find_staff_regions,
    group_staff_regions,
)
from .staff_rectifier import (
    StaffReference,
    batch_rectify,
    compute_staff_line_paths,
    compute_staff_reference,
    enhance_staff_lines,
    rectify_staff_region,
    rectify_staff_region_with_mask,
)

__all__ = [
    "HeaderRegion",
    "StaffReference",
    "StaffRegion",
    "batch_rectify",
    "compute_staff_line_paths",
    "compute_staff_reference",
    "detect_header_regions",
    "estimate_page_margins",
    "enhance_staff_lines",
    "extract_staff_line_mask",
    "find_staff_regions",
    "group_staff_regions",
    "rectify_staff_region",
    "rectify_staff_region_with_mask",
]
