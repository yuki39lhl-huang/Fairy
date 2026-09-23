"""Inspect Fairy layer PNGs and compare their ComfyUI composite to the source.

Uses only Python's standard library and supports the non-interlaced 8-bit RGB
and RGBA PNG files produced by this project and ComfyUI.
"""

from __future__ import annotations

import json
import struct
import sys
import zlib
from dataclasses import asdict, dataclass
from pathlib import Path


CANVAS_SIZE = 1254
LAYER_NAMES = ("background", "outer_ring", "blue_glow", "white_ring", "core", "icon", "composite")


class VerificationError(RuntimeError):
    """A required layer or quality check failed."""


@dataclass(frozen=True)
class LayerReport:
    name: str
    width: int
    height: int
    mode: str
    alpha_min: int
    alpha_max: int
    visible_pixels: int
    transparent_pixels: int
    semi_transparent_pixels: int
    visible_bbox: tuple[int, int, int, int] | None
    opaque_black_pixels: int
    transparent_color_residue: int


@dataclass(frozen=True)
class VerificationReport:
    layers: tuple[LayerReport, ...]
    composite_mae: float
    composite_max_error: int
    composite_different_channels: int


def _paeth(left: int, above: int, upper_left: int) -> int:
    pa = abs(above - upper_left)
    pb = abs(left - upper_left)
    pc = abs(left + above - (upper_left * 2))
    return left if pa <= pb and pa <= pc else above if pb <= pc else upper_left


def read_png(path: Path) -> tuple[int, int, str, bytearray]:
    """Decode a non-interlaced 8-bit RGB/RGBA PNG into unfiltered pixels."""
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise VerificationError(f"Not a PNG: {path}")
    offset = 8
    width = height = bit_depth = color_type = compression = filter_method = interlace = None
    compressed = bytearray()
    while offset + 12 <= len(data):
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        kind = data[offset + 4 : offset + 8]
        chunk_end = offset + 8 + length
        if chunk_end + 4 > len(data):
            raise VerificationError(f"Truncated PNG chunk: {path}")
        chunk = data[offset + 8 : chunk_end]
        offset = chunk_end + 4
        if kind == b"IHDR":
            width, height, bit_depth, color_type, compression, filter_method, interlace = struct.unpack(">IIBBBBB", chunk)
        elif kind == b"IDAT":
            compressed.extend(chunk)
        elif kind == b"IEND":
            break
    if None in (width, height, bit_depth, color_type, compression, filter_method, interlace):
        raise VerificationError(f"Missing PNG header: {path}")
    if (bit_depth, color_type, compression, filter_method, interlace) not in {(8, 2, 0, 0, 0), (8, 6, 0, 0, 0)}:
        raise VerificationError(f"Expected an 8-bit non-interlaced RGB/RGBA PNG: {path}")

    bytes_per_pixel = 4 if color_type == 6 else 3
    stride = width * bytes_per_pixel
    raw = zlib.decompress(compressed)
    if len(raw) != height * (stride + 1):
        raise VerificationError(f"Unexpected decompressed pixel size: {path}")
    decoded = bytearray(height * stride)
    previous = bytearray(stride)
    cursor = output = 0
    for _ in range(height):
        filter_type = raw[cursor]
        cursor += 1
        row = bytearray(raw[cursor : cursor + stride])
        cursor += stride
        for index in range(stride):
            left = row[index - bytes_per_pixel] if index >= bytes_per_pixel else 0
            above = previous[index]
            upper_left = previous[index - bytes_per_pixel] if index >= bytes_per_pixel else 0
            if filter_type == 1:
                row[index] = (row[index] + left) & 0xFF
            elif filter_type == 2:
                row[index] = (row[index] + above) & 0xFF
            elif filter_type == 3:
                row[index] = (row[index] + ((left + above) // 2)) & 0xFF
            elif filter_type == 4:
                row[index] = (row[index] + _paeth(left, above, upper_left)) & 0xFF
            elif filter_type != 0:
                raise VerificationError(f"Unsupported PNG filter {filter_type}: {path}")
        decoded[output : output + stride] = row
        output += stride
        previous = row
    return width, height, "RGBA" if color_type == 6 else "RGB", decoded


def write_rgba_png(path: Path, width: int, height: int, pixels: bytearray) -> None:
    if len(pixels) != width * height * 4:
        raise VerificationError(f"Incorrect RGBA buffer size for: {path}")

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)
        start = y * stride
        raw.extend(pixels[start : start + stride])
    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    path.write_bytes(data)


def clear_fully_transparent_rgb(path: Path) -> None:
    """Zero invisible RGB values, avoiding color residue in nonstandard renderers."""
    width, height, mode, pixels = read_png(path)
    if mode != "RGBA":
        raise VerificationError(f"Layer is not RGBA: {path}")
    changed = False
    for index in range(0, len(pixels), 4):
        if pixels[index + 3] == 0 and pixels[index : index + 3] != b"\x00\x00\x00":
            pixels[index : index + 3] = b"\x00\x00\x00"
            changed = True
    if changed:
        write_rgba_png(path, width, height, pixels)


def analyse_layer(name: str, path: Path) -> LayerReport:
    width, height, mode, pixels = read_png(path)
    if mode != "RGBA":
        raise VerificationError(f"{name}.png lacks an RGBA alpha channel")
    if (width, height) != (CANVAS_SIZE, CANVAS_SIZE):
        raise VerificationError(f"{name}.png has {width}x{height}, expected {CANVAS_SIZE}x{CANVAS_SIZE}")
    alpha_min, alpha_max = 255, 0
    visible = transparent = semi_transparent = opaque_black = residue = 0
    min_x = min_y = CANVAS_SIZE
    max_x = max_y = -1
    for pixel_index in range(0, len(pixels), 4):
        x = (pixel_index // 4) % width
        y = (pixel_index // 4) // width
        red, green, blue, alpha = pixels[pixel_index : pixel_index + 4]
        alpha_min = min(alpha_min, alpha)
        alpha_max = max(alpha_max, alpha)
        if alpha == 0:
            transparent += 1
            residue += int((red, green, blue) != (0, 0, 0))
            continue
        visible += 1
        semi_transparent += int(alpha < 255)
        min_x, min_y = min(min_x, x), min(min_y, y)
        max_x, max_y = max(max_x, x), max(max_y, y)
        opaque_black += int(alpha == 255 and red == 0 and green == 0 and blue == 0)
    bbox = None if visible == 0 else (min_x, min_y, max_x, max_y)
    return LayerReport(name, width, height, mode, alpha_min, alpha_max, visible, transparent, semi_transparent, bbox, opaque_black, residue)


def compare_source_to_composite(source_path: Path, composite_path: Path) -> tuple[float, int, int]:
    source_width, source_height, source_mode, source = read_png(source_path)
    width, height, mode, composite = read_png(composite_path)
    if (source_width, source_height, width, height) != (CANVAS_SIZE, CANVAS_SIZE, CANVAS_SIZE, CANVAS_SIZE):
        raise VerificationError("Source or composite dimensions are wrong")
    if source_mode != "RGB" or mode != "RGBA":
        raise VerificationError("Expected an RGB source and RGBA composite")
    total_error = max_error = different = 0
    for source_index, composite_index in zip(range(0, len(source), 3), range(0, len(composite), 4)):
        for channel in range(3):
            difference = abs(source[source_index + channel] - composite[composite_index + channel])
            total_error += difference
            max_error = max(max_error, difference)
            different += int(difference != 0)
    return total_error / (CANVAS_SIZE * CANVAS_SIZE * 3), max_error, different


def _assert_expected_geometry(reports: dict[str, LayerReport]) -> None:
    for name in LAYER_NAMES:
        report = reports[name]
        if report.visible_pixels == 0 or report.alpha_max == 0:
            raise VerificationError(f"{name}.png has no visible content")
        if name != "composite" and report.transparent_pixels == 0:
            raise VerificationError(f"{name}.png has no transparent pixels")
        if report.transparent_color_residue:
            raise VerificationError(f"{name}.png has RGB residue under transparent pixels")
    if reports["composite"].alpha_min != 255:
        raise VerificationError("composite.png is not fully opaque")
    if reports["blue_glow"].alpha_min != 0 or reports["blue_glow"].alpha_max != 255:
        raise VerificationError("blue_glow.png does not retain a useful alpha range")
    if reports["blue_glow"].semi_transparent_pixels < 10_000:
        raise VerificationError("blue_glow.png does not contain a sufficiently soft translucent halo")
    blue_bbox = reports["blue_glow"].visible_bbox
    icon_bbox = reports["icon"].visible_bbox
    if blue_bbox is None or blue_bbox[0] > 150 or blue_bbox[2] < 1100 or blue_bbox[1] > 150:
        raise VerificationError("blue_glow.png appears to have its outer halo cut off")
    if icon_bbox is None or icon_bbox[0] > 1040 or icon_bbox[2] < 1180 or icon_bbox[1] > 1060:
        raise VerificationError("icon.png does not cover the lower-right Fairy icon")


def verify_layers(source_path: Path, layer_directory: Path) -> VerificationReport:
    """Sanitize transparent pixels, run alpha/bounds checks, and compare output."""
    for name in LAYER_NAMES:
        path = layer_directory / f"{name}.png"
        if not path.is_file():
            raise VerificationError(f"Missing output: {path}")
        clear_fully_transparent_rgb(path)
    reports = {name: analyse_layer(name, layer_directory / f"{name}.png") for name in LAYER_NAMES}
    _assert_expected_geometry(reports)
    mae, max_error, different = compare_source_to_composite(source_path, layer_directory / "composite.png")
    if mae > 0.5 or max_error > 3:
        raise VerificationError(f"Composite differs too much from source (MAE {mae:.4f}, max {max_error})")
    return VerificationReport(tuple(reports[name] for name in LAYER_NAMES), mae, max_error, different)


def main() -> int:
    workspace = Path(__file__).resolve().parent
    try:
        report = verify_layers(workspace / "fairy_source.png", workspace / "layers")
    except (OSError, VerificationError) as error:
        print(f"Verification failed: {error}", file=sys.stderr)
        return 1
    output = json.dumps(asdict(report), ensure_ascii=False, indent=2)
    (workspace / "fairy_layers_verification.json").write_text(output + "\n", encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
