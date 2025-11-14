"""Layout analysis utilities for staff segmentation and header detection."""

from .detect_headers import HeaderRegion, detect_header_regions, estimate_page_margins
from .staff_detection import (
    StaffRegion,
    extract_staff_line_mask,
    find_staff_regions,
    group_staff_regions,
)

__all__ = [
    "HeaderRegion",
    "StaffRegion",
    "detect_header_regions",
    "estimate_page_margins",
    "extract_staff_line_mask",
    "find_staff_regions",
    "group_staff_regions",
]
