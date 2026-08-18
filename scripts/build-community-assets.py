#!/usr/bin/env python3
"""Validate approved Figma Community PNG assets without modifying them."""

from __future__ import annotations

import struct
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "community" / "assets"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
EXPECTED_ASSETS = {
    "icon-128.png": (128, 128),
    "thumbnail-1920x1080.png": (1920, 1080),
    "carousel-01-core.png": (1920, 1080),
    "carousel-02-workflow.png": (1920, 1080),
    "carousel-03-boundaries.png": (1920, 1080),
}


def png_dimensions(path: Path) -> tuple[int, int]:
    with path.open("rb") as source:
        header = source.read(24)
    if header[:8] != PNG_SIGNATURE or header[12:16] != b"IHDR":
        raise ValueError("not a valid PNG with an IHDR header")
    return struct.unpack(">II", header[16:24])


def main() -> int:
    failures: list[str] = []
    if not ASSET_DIR.is_dir():
        failures.append("missing community/assets directory")
        actual_assets: set[str] = set()
    else:
        actual_assets = {
            path.name
            for path in ASSET_DIR.iterdir()
            if path.is_file() and path.suffix.lower() == ".png"
        }
    expected_names = set(EXPECTED_ASSETS)

    for name in sorted(expected_names - actual_assets):
        failures.append(f"missing expected asset: {name}")
    for name in sorted(actual_assets - expected_names):
        failures.append(f"unexpected PNG asset: {name}")

    for name, expected_size in EXPECTED_ASSETS.items():
        path = ASSET_DIR / name
        if not path.is_file():
            continue
        try:
            actual_size = png_dimensions(path)
        except (OSError, ValueError) as error:
            failures.append(f"invalid PNG {name}: {error}")
            continue
        if actual_size != expected_size:
            failures.append(
                f"invalid dimensions for {name}: expected {expected_size[0]}x{expected_size[1]}, "
                f"got {actual_size[0]}x{actual_size[1]}"
            )

    if failures:
        print("Community asset validation failed:", file=sys.stderr)
        for failure in failures:
            print(f"- {failure}", file=sys.stderr)
        return 1

    print("Community asset validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
