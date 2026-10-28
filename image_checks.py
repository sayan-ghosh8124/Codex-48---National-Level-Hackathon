from __future__ import annotations

import base64
import io
import re
from typing import Any, Dict, Iterable, List, Optional, Tuple

from PIL import Image


BRAND_PALETTE = {
    "#7C5CFF": "primary purple",
    "#35D2FF": "cyan accent",
    "#F5F7FF": "off-white",
    "#05070F": "midnight",
}


def _hex_to_rgb(value: str) -> Optional[Tuple[int, int, int]]:
    """Convert a hex color string to an RGB tuple."""
    if not value:
        return None
    cleaned = value.strip().lower()
    if not re.fullmatch(r"#[0-9a-f]{3}|#[0-9a-f]{6}", cleaned):
        return None
    if len(cleaned) == 4:
        cleaned = "#" + "".join(ch * 2 for ch in cleaned[1:])
    try:
        return tuple(int(cleaned[i:i + 2], 16) for i in (1, 3, 5))
    except ValueError:
        return None


def _relative_luminance(rgb: Tuple[int, int, int]) -> float:
    """Measure relative luminance for WCAG contrast calculations."""
    channels = []
    for channel in rgb:
        normalized = channel / 255
        channels.append(normalized / 12.92 if normalized <= 0.03928 else ((normalized + 0.055) / 1.055) ** 2.4)
    r, g, b = channels
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast_ratio(foreground: Optional[str], background: Optional[str]) -> Optional[float]:
    """Return the WCAG contrast ratio for a foreground/background pair."""
    fg = _hex_to_rgb(foreground or "")
    bg = _hex_to_rgb(background or "")
    if fg is None or bg is None:
        return None
    luminance_1 = _relative_luminance(fg)
    luminance_2 = _relative_luminance(bg)
    light = max(luminance_1, luminance_2)
    dark = min(luminance_1, luminance_2)
    return (light + 0.05) / (dark + 0.05)


def _finding(
    *,
    finding_id: str,
    text: str,
    category: str,
    severity: str,
    confidence: str,
    source_type: str,
    source_id: str,
    explanation: str,
    suggestion: str,
    span_start: int,
    span_end: int,
) -> Dict[str, Any]:
    """Create a normalized BrandGuard finding for image/accessibility checks."""
    return {
        "id": finding_id,
        "span_start": span_start,
        "span_end": span_end,
        "text": text,
        "category": category,
        "severity": severity,
        "confidence": confidence,
        "source_type": source_type,
        "source_id": source_id,
        "explanation": explanation,
        "suggestion": suggestion,
    }


def _dominant_palette(image: Image.Image) -> List[Tuple[int, int, int]]:
    """Return the most prominent colors in an image for palette comparison."""
    resized = image.convert("RGB").resize((64, 64))
    pixels = list(resized.getdata())
    color_counts: Dict[Tuple[int, int, int], int] = {}
    for pixel in pixels:
        if pixel[3] if len(pixel) > 3 else 255 < 20:
            continue
        color_counts[pixel] = color_counts.get(pixel, 0) + 1
    ranked = sorted(color_counts.items(), key=lambda item: item[1], reverse=True)
    return [color for color, _ in ranked[:5]]


def _palette_match_score(colors: Iterable[Tuple[int, int, int]]) -> float:
    """Return how strongly an image matches the approved BrandGuard palette."""
    palette = [_hex_to_rgb(color) for color in BRAND_PALETTE.keys() if _hex_to_rgb(color) is not None]
    total = 0
    matches = 0
    for color in colors:
        nearest = min(palette, key=lambda candidate: sum((candidate[i] - color[i]) ** 2 for i in range(3)))
        total += 1
        if sum((nearest[i] - color[i]) ** 2 for i in range(3)) <= 2000:
            matches += 1
    return (matches / total) if total else 0.0


def _logo_use_check(image: Image.Image) -> Optional[Dict[str, Any]]:
    """Flag a logo that likely uses unapproved colors when a branded asset is detected."""
    colors = _dominant_palette(image)
    score = _palette_match_score(colors)
    if score >= 0.6:
        return None
    return _finding(
        finding_id="img-logo-1",
        text="logo palette",
        category="visual",
        severity="medium",
        confidence="medium",
        source_type="rule",
        source_id="R15",
        explanation="The dominant palette in the supplied asset does not closely match the approved Lumio-brand palette, which may be unsuitable for publication.",
        suggestion="Use a logo or asset that stays within the approved brand palette or confirm the asset is approved by brand stakeholders.",
        span_start=0,
        span_end=40,
    )


def validate_image_accessibility(image_bytes: bytes, *, alt_text: str, text_color: Optional[str], background_color: Optional[str]) -> List[Dict[str, Any]]:
    """Run a set of image and accessibility checks over a provided image payload."""
    findings: List[Dict[str, Any]] = []
    if not alt_text or not alt_text.strip():
        raise ValueError("Alt text is required for every uploaded image.")
    if len(image_bytes) > 5 * 1024 * 1024:
        raise ValueError("Uploaded image exceeds the 5MB limit for BrandGuard review.")

    try:
        image = Image.open(io.BytesIO(image_bytes))
        image.load()
    except Exception as exc:  # pragma: no cover - defensive path
        raise ValueError(f"Could not decode uploaded image: {exc}") from exc

    ratio = contrast_ratio(text_color, background_color)
    if ratio is not None and ratio < 4.5:
        findings.append(
            _finding(
                finding_id="img-contrast-1",
                text="text contrast",
                category="accessibility",
                severity="high" if ratio < 3 else "medium",
                confidence="high",
                source_type="rule",
                source_id="R14",
                explanation=f"The supplied text/background colors do not meet WCAG AA contrast guidance for regular text (contrast ratio {ratio:.2f}:1).",
                suggestion="Increase contrast between the text and background color choices or switch to approved Lumio colors with stronger separation.",
                span_start=0,
                span_end=30,
            )
        )

    palette_check = _logo_use_check(image)
    if palette_check is not None:
        findings.append(palette_check)

    return findings


def decode_base64_image(value: str) -> bytes:
    """Decode a base64-encoded image payload into raw bytes."""
    if not value:
        raise ValueError("Image content is required.")
    if value.startswith("data:"):
        header, _, encoded = value.partition(",")
        if not encoded:
            raise ValueError("The uploaded image payload is empty.")
        value = encoded
    padding = "=" * ((4 - len(value) % 4) % 4)
    return base64.b64decode(value + padding, validate=False)
