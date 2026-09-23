"""Create reusable transparent Fairy layers with ComfyUI.

Pipeline:
ComfyUI input/fairy.png -> local source snapshot -> deterministic masks ->
ComfyUI alpha exports -> ComfyUI composite -> pixel/alpha verification.

No third-party Python package is required. The actual RGBA exports are made
by ComfyUI nodes so the saved workflow remains reproducible in ComfyUI.
"""

from __future__ import annotations

import json
import math
import mimetypes
import struct
import sys
import time
import uuid
import zlib
from dataclasses import asdict
from pathlib import Path
from typing import Any, Callable, Mapping
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from comfyui_client import ComfyUIClient, ComfyUIError
from verify_fairy_layers import VerificationError, verify_layers


COMFYUI_URL = "http://127.0.0.1:8188"
COMFYUI_SOURCE_NAME = "fairy.png"
WORKSPACE = Path(__file__).resolve().parent
SOURCE_PATH = WORKSPACE / "fairy_source.png"
MASK_DIRECTORY = WORKSPACE / "fairy_layer_masks"
LAYER_DIRECTORY = WORKSPACE / "layers"
WORKFLOW_PATH = WORKSPACE / "fairy_layers_workflow_api.json"
VERIFICATION_PATH = WORKSPACE / "fairy_layers_verification.json"

CANVAS_SIZE = 1254
CENTER_X = 627.0
CENTER_Y = 655.0
# 小白点（瞳孔）在正上方，贴白环内缘；旧错误坐标 (735,786) 是 4 点钟不要再用
ICON_X = 1111.0  # 设计稿右下角静音钮，不是瞳孔
ICON_Y = 1126.0
PUPIL_X = 627.0
PUPIL_Y = 454.2
LAYER_ORDER = ("background", "blue_glow", "outer_ring", "core", "white_ring", "pupil", "icon")


def read_png_dimensions(path: Path) -> tuple[int, int]:
    with path.open("rb") as file:
        header = file.read(24)
    if header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR":
        raise ValueError(f"Not a PNG file: {path}")
    return struct.unpack(">II", header[16:24])


def png_chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


def write_mask_png(path: Path, width: int, height: int, alpha_at: Callable[[int, int], float]) -> None:
    """Write a greyscale RGB mask for ComfyUI's ImageToMask node."""
    rows = bytearray()
    for y in range(height):
        rows.append(0)
        for x in range(width):
            value = max(0, min(255, round(alpha_at(x, y) * 255)))
            rows.extend((value, value, value))
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", ihdr) + png_chunk(b"IDAT", zlib.compress(bytes(rows), 9)) + png_chunk(b"IEND", b"")
    path.write_bytes(png)


def smoothstep(edge0: float, edge1: float, value: float) -> float:
    amount = max(0.0, min(1.0, (value - edge0) / (edge1 - edge0)))
    return amount * amount * (3.0 - 2.0 * amount)


def circle(cx: float, cy: float, radius: float, feather: float = 2.0) -> Callable[[int, int], float]:
    return lambda x, y: 1.0 - smoothstep(radius - feather, radius + feather, math.hypot(x - cx, y - cy))


def annulus(cx: float, cy: float, inner: float, outer: float, feather: float = 2.0) -> Callable[[int, int], float]:
    def alpha(x: int, y: int) -> float:
        distance = math.hypot(x - cx, y - cy)
        return smoothstep(inner - feather, inner + feather, distance) * (1.0 - smoothstep(outer - feather, outer + feather, distance))

    return alpha


def outer_halo(cx: float, cy: float) -> Callable[[int, int], float]:
    """Soft outer cyan rim and diffuse glow, intentionally translucent."""
    def alpha(x: int, y: int) -> float:
        distance = math.hypot(x - cx, y - cy)
        rise = smoothstep(412.0, 448.0, distance)
        fall = 1.0 - smoothstep(450.0, 535.0, distance)
        return rise * fall

    return alpha


def union(*masks: Callable[[int, int], float]) -> Callable[[int, int], float]:
    return lambda x, y: max(mask(x, y) for mask in masks)


def make_masks() -> dict[str, Path]:
    """Create antialiased masks for the 1254px Fairy artwork.

    Opaque regions partition the circular body. The diffuse halo remains
    translucent, while its original backdrop is retained in background.png so
    the ComfyUI composite has no dark fringe or brightness duplication.
    """
    MASK_DIRECTORY.mkdir(exist_ok=True)
    cx, cy = CENTER_X, CENTER_Y
    core = circle(cx, cy, 112.0)
    blue_inner = annulus(cx, cy, 107.0, 202.0)
    blue_glow = union(blue_inner, outer_halo(cx, cy))
    white_ring = union(annulus(cx, cy, 191.0, 294.0), circle(735.0, 786.0, 50.0, feather=2.5))
    outer_ring = annulus(cx, cy, 290.0, 444.0)
    icon = circle(ICON_X, ICON_Y, 91.0, feather=3.0)

    opaque_body = union(core, blue_inner, white_ring, outer_ring, icon)
    background = lambda x, y: 0.0 if opaque_body(x, y) >= 0.999 else 1.0
    definitions: Mapping[str, Callable[[int, int], float]] = {
        "background": background,
        "blue_glow": blue_glow,
        "outer_ring": outer_ring,
        "core": core,
        "white_ring": white_ring,
        "icon": icon,
    }
    paths: dict[str, Path] = {}
    for name, alpha_at in definitions.items():
        path = MASK_DIRECTORY / f"{name}_mask.png"
        write_mask_png(path, CANVAS_SIZE, CANVAS_SIZE, alpha_at)
        paths[name] = path
    return paths


def fetch_comfyui_input(base_url: str, filename: str, destination: Path) -> None:
    """Copy the selected ComfyUI input image into the project for repeatable QA."""
    request = Request(f"{base_url.rstrip('/')}/view?filename={filename}&type=input", headers={"Accept": "image/png"})
    try:
        with urlopen(request, timeout=30) as response:
            data = response.read()
    except (HTTPError, URLError) as error:
        raise RuntimeError(f"Could not fetch ComfyUI input {filename}: {error}") from error
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError(f"ComfyUI input {filename} was not returned as PNG data")
    destination.write_bytes(data)


def upload_image(base_url: str, local_path: Path, remote_name: str) -> str:
    """Upload one PNG to ComfyUI's input directory using multipart stdlib HTTP."""
    boundary = f"----FairyLayerUpload{uuid.uuid4().hex}"
    mime_type = mimetypes.guess_type(local_path.name)[0] or "application/octet-stream"
    form = bytearray()

    def add_field(name: str, value: str) -> None:
        form.extend(f"--{boundary}\r\n".encode())
        form.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        form.extend(value.encode())
        form.extend(b"\r\n")

    add_field("overwrite", "true")
    form.extend(f"--{boundary}\r\n".encode())
    form.extend(f'Content-Disposition: form-data; name="image"; filename="{remote_name}"\r\n'.encode())
    form.extend(f"Content-Type: {mime_type}\r\n\r\n".encode())
    form.extend(local_path.read_bytes())
    form.extend(b"\r\n")
    form.extend(f"--{boundary}--\r\n".encode())

    request = Request(
        f"{base_url.rstrip('/')}/upload/image",
        data=bytes(form),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        message = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"ComfyUI rejected {local_path.name}: HTTP {error.code}: {message}") from error
    except URLError as error:
        raise RuntimeError(f"Could not upload {local_path.name}: {error.reason}") from error
    name = result.get("name")
    subfolder = result.get("subfolder", "")
    if not isinstance(name, str) or not name:
        raise RuntimeError(f"Unexpected upload response for {local_path.name}: {result}")
    return f"{subfolder}/{name}".lstrip("/") if subfolder else name


def build_workflow(source_name: str, mask_names: Mapping[str, str]) -> tuple[dict[str, Any], dict[str, str]]:
    """Build an API-format layer export plus same-mask composite workflow."""
    workflow: dict[str, Any] = {"1": {"class_type": "LoadImage", "inputs": {"image": source_name}}}
    direct_masks: dict[str, str] = {}
    save_nodes: dict[str, str] = {}
    next_id = 10
    for layer in LAYER_ORDER:
        mask_load = str(next_id)
        direct_mask = str(next_id + 1)
        inverse_mask = str(next_id + 2)
        rgba = str(next_id + 3)
        save = str(next_id + 4)
        workflow[mask_load] = {"class_type": "LoadImage", "inputs": {"image": mask_names[layer]}}
        workflow[direct_mask] = {"class_type": "ImageToMask", "inputs": {"image": [mask_load, 0], "channel": "red"}}
        workflow[inverse_mask] = {"class_type": "InvertMask", "inputs": {"mask": [direct_mask, 0]}}
        workflow[rgba] = {"class_type": "JoinImageWithAlpha", "inputs": {"image": ["1", 0], "alpha": [inverse_mask, 0]}}
        workflow[save] = {"class_type": "SaveImage", "inputs": {"images": [rgba, 0], "filename_prefix": f"fairy_layers/{layer}"}}
        direct_masks[layer] = direct_mask
        save_nodes[layer] = save
        next_id += 5

    previous = str(next_id)
    workflow[previous] = {"class_type": "EmptyImage", "inputs": {"width": CANVAS_SIZE, "height": CANVAS_SIZE, "batch_size": 1, "color": 0}}
    for layer in LAYER_ORDER:
        current = str(int(previous) + 1)
        workflow[current] = {
            "class_type": "ImageCompositeMasked",
            "inputs": {"destination": [previous, 0], "source": ["1", 0], "x": 0, "y": 0, "resize_source": False, "mask": [direct_masks[layer], 0]},
        }
        previous = current
    opaque_mask = str(int(previous) + 1)
    rgba_composite = str(int(previous) + 2)
    composite_save = str(int(previous) + 3)
    workflow[opaque_mask] = {"class_type": "SolidMask", "inputs": {"value": 0.0, "width": CANVAS_SIZE, "height": CANVAS_SIZE}}
    workflow[rgba_composite] = {"class_type": "JoinImageWithAlpha", "inputs": {"image": [previous, 0], "alpha": [opaque_mask, 0]}}
    workflow[composite_save] = {"class_type": "SaveImage", "inputs": {"images": [rgba_composite, 0], "filename_prefix": "fairy_layers/composite"}}
    save_nodes["composite"] = composite_save
    return workflow, save_nodes


def wait_for_result(client: ComfyUIClient, prompt_id: str, timeout_seconds: float = 90.0) -> None:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        status = client.get_prompt_status(prompt_id)
        if status.state == "completed":
            return
        if status.state == "failed":
            raise RuntimeError(f"ComfyUI reported a failed prompt: {status.details}")
        time.sleep(0.5)
    raise TimeoutError(f"Timed out waiting for ComfyUI prompt {prompt_id}")


def main() -> int:
    client = ComfyUIClient(COMFYUI_URL)
    try:
        client.get_system_stats()
        fetch_comfyui_input(client.base_url, COMFYUI_SOURCE_NAME, SOURCE_PATH)
        if read_png_dimensions(SOURCE_PATH) != (CANVAS_SIZE, CANVAS_SIZE):
            raise RuntimeError(f"Expected {CANVAS_SIZE}x{CANVAS_SIZE} source, found {read_png_dimensions(SOURCE_PATH)}")
        masks = make_masks()
        source_name = upload_image(client.base_url, SOURCE_PATH, "fairy_layers_source.png")
        mask_names = {layer: upload_image(client.base_url, path, f"fairy_layers_{layer}_mask.png") for layer, path in masks.items()}
        workflow, save_nodes = build_workflow(source_name, mask_names)
        WORKFLOW_PATH.write_text(json.dumps(workflow, ensure_ascii=False, indent=2), encoding="utf-8")
        submission = client.submit_workflow(workflow)
        wait_for_result(client, submission.prompt_id)

        result = client.get_results(submission.prompt_id)
        files_by_node = {file.node_id: file for file in result.files}
        missing = [layer for layer, node_id in save_nodes.items() if node_id not in files_by_node]
        if missing:
            raise RuntimeError(f"ComfyUI did not return image outputs for: {', '.join(missing)}")
        LAYER_DIRECTORY.mkdir(exist_ok=True)
        for layer, node_id in save_nodes.items():
            (LAYER_DIRECTORY / f"{layer}.png").write_bytes(client.get_file_bytes(files_by_node[node_id]))
        report = verify_layers(SOURCE_PATH, LAYER_DIRECTORY)
        VERIFICATION_PATH.write_text(json.dumps(asdict(report), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except (ComfyUIError, OSError, RuntimeError, TimeoutError, VerificationError) as error:
        print(f"Fairy layer build failed: {error}", file=sys.stderr)
        return 1

    print(f"ComfyUI prompt completed: {submission.prompt_id}")
    print(f"Verified {len(report.layers)} RGBA images; composite MAE: {report.composite_mae:.4f}")
    print(f"Layers: {LAYER_DIRECTORY}")
    print(f"Workflow: {WORKFLOW_PATH}")
    print(f"Verification: {VERIFICATION_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
