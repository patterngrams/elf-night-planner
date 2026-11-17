#!/usr/bin/env python3
# Elf Night Planner · SPDX-License-Identifier: AGPL-3.0-or-later
"""Remove EXIF, GPS, XMP and IPTC metadata from JPEG photos, in place.

    python3 tools/strip-metadata.py photos/*.jpg

Phone photos can carry the exact location they were taken. Run this on every
photo before you publish it. Standard library only; keeps the image data and
color profile, drops APP1 (EXIF/XMP), APP13 (IPTC) and comment segments.
Rotate photos upright before stripping: the orientation flag lives in EXIF.
"""
import sys

DROP = {0xE1, 0xED, 0xFE}  # APP1, APP13, COM


def strip(data: bytes) -> bytes:
    if data[:2] != b"\xff\xd8":
        raise ValueError("not a JPEG")
    out, i = bytearray(b"\xff\xd8"), 2
    while i < len(data):
        if data[i] != 0xFF:
            raise ValueError(f"bad marker at byte {i}")
        marker = data[i + 1]
        if marker == 0xDA:  # start of scan: the rest is image data
            out += data[i:]
            return bytes(out)
        length = int.from_bytes(data[i + 2:i + 4], "big")
        segment = data[i:i + 2 + length]
        if marker not in DROP:
            out += segment
        i += 2 + length
    raise ValueError("no image data found")


def main(paths):
    if not paths:
        print(__doc__)
        return 1
    for path in paths:
        with open(path, "rb") as f:
            before = f.read()
        after = strip(before)
        with open(path, "wb") as f:
            f.write(after)
        print(f"{path}: removed {len(before) - len(after)} bytes of metadata")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
