"""Build Fairy layers_v4 from the orb-free source `无第7层圆环的fiary.png`.

Why v4:
- The new source has no L7 orb, so L3–L6 need no inpainting at all.
- Ring boundaries are re-measured on that image and mapped to the canvas so
  that the white ring outer radius stays 208 px (same visual size as before).
- L4 / L5 are corrected to match fairy定位.png (4 = light-blue band,
  5 = thin blue ring); previously the band was baked into L3.
- L7 is a clean white disc (from 第四层白环.png) sized to be tangent to L6 at
  the minimum breathing scale.

Runtime rules unchanged: L2 rotates, L3 + L6 breathe, L7 rides the rim unscaled.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "live2d-fairy"
OUTPUT = ROOT / "ZeroFairyClient" / "src" / "renderer" / "public" / "fairy" / "layers_v4"
QA_OUTPUT = ASSETS / "qa" / "layers_v4"

SOURCE = ASSETS / "无第7层圆环的fiary.png"
ORB_SOURCE = ASSETS / "第四层白环.png"
BACKGROUND_SOURCE = ASSETS / "底层背景.png"

# Canvas geometry (unchanged so FairyEyeCanvas constants stay valid).
W, H = 873, 940
CX, CY = 449.6, 507.3
PUPIL_X, PUPIL_Y = 491.0, 618.0
PUPIL_BASE_R = math.hypot(PUPIL_X - CX, PUPIL_Y - CY)
BREATH_MIN = 0.975
BREATH_MAX = 1.025

# Measured on the source (1208x1302): eye centre and white-ring outer radius.
SRC_CX, SRC_CY = 617.0, 695.3
SRC_WHITE_OUTER = 293.0
WHITE_OUTER_CANVAS = 208.0
SCALE = WHITE_OUTER_CANVAS / SRC_WHITE_OUTER  # ~0.710


def c(r_src: float) -> float:
    """Source radius -> canvas radius."""
    return r_src * SCALE


# Nominal boundaries (source px) -> canvas px.
R6_OUTER = c(124.0)      # 88.0
R5_OUTER = c(156.0)      # 110.8
R4_OUTER = c(208.0)      # 147.7
R3_OUTER = c(293.0)      # 208.0
R2_OUTER = c(444.0)      # 315.2
R1_OUTER = c(560.0)      # 397.6 (glow tail)

RADII = {
    "layer_01": (R2_OUTER, R1_OUTER),
    "layer_02": (R3_OUTER, R2_OUTER),
    "layer_03": (R4_OUTER, R3_OUTER),
    "layer_04": (R5_OUTER, R4_OUTER),
    "layer_05": (R6_OUTER, R5_OUTER),
    "layer_06": (0.0, R6_OUTER),
}
# Cut masks overlap by a few px so breathing (±2.5%) never opens a dark seam.
# Draw order in the renderer is L2, L3, L4, L5, L6, L7 (later = on top).
MASK_RADII = {
    "layer_01": (R2_OUTER - 4.0, R1_OUTER),
    # L2 is the only static layer; L3 breathes (x0.975) *and* the eye-white group
    # shifts by up to EYEWHITE_GAZE_OFFSET (14 px). L2 therefore extends inward to
    # ~184 with the dark gear-ring texture continued inward (see fill_ring_inward),
    # so whatever L3 uncovers on the far side is dark ring, never background and
    # never a second white edge.
    "layer_02": (R3_OUTER - 24.0, R2_OUTER + 3.0),
    # L3 owns the white ring *and* its full blue glow (~208-216) so the glow moves
    # and breathes with the ring instead of staying behind on L2.
    "layer_03": (R4_OUTER - 3.0, R3_OUTER + 8.0),
    "layer_04": (R5_OUTER - 3.0, R4_OUTER + 5.0),   # white over L3's inner edge
    # L6 carries its bright rim (~86.6-88.7) plus a slice of blue ring so that at
    # BREATH_MIN (x0.975 -> 92.6) it still hides L5's inner edge; L5 starts past
    # the rim so no second rim can peek out while L6 contracts.
    "layer_05": (R6_OUTER + 3.0, R5_OUTER + 3.0),
    "layer_06": (0.0, R6_OUTER + 7.0),
}
FEATHER = {
    "layer_01": 6.0,
    "layer_02": 1.5,
    "layer_03": 1.5,
    "layer_04": 1.5,
    "layer_05": 1.5,
    "layer_06": 1.5,
}

# L7 tangent to L6 at minimum breath: R7 = BREATH_MIN * (PUPIL_BASE_R - R6)
PUPIL_R = round(BREATH_MIN * (PUPIL_BASE_R - R6_OUTER), 2)
# White disc source: solid radius measured from alpha/luminance.
ORB_SRC_CX, ORB_SRC_CY, ORB_SRC_R = 601.7, 631.2, 366.0

LAYER_NAMES = tuple(f"layer_{i:02d}" for i in range(1, 8))


def smoothstep(e0: float, e1: float, v: float) -> float:
    if v <= e0:
        return 0.0
    if v >= e1:
        return 1.0
    t = (v - e0) / (e1 - e0)
    return t * t * (3.0 - 2.0 * t)


def annulus_mask(inner: float, outer: float, feather: float) -> Image.Image:
    mask = Image.new("L", (W, H))
    px = mask.load()
    for y in range(H):
        for x in range(W):
            d = math.hypot(x - CX, y - CY)
            a = smoothstep(inner - feather, inner + feather, d) * (
                1.0 - smoothstep(outer - feather, outer + feather, d)
            )
            px[x, y] = round(255 * a)
    return mask


def circle_mask(cx: float, cy: float, radius: float, feather: float) -> Image.Image:
    mask = Image.new("L", (W, H))
    px = mask.load()
    for y in range(H):
        for x in range(W):
            d = math.hypot(x - cx, y - cy)
            px[x, y] = round(255 * (1.0 - smoothstep(radius - feather, radius + feather, d)))
    return mask


def rgba_with_mask(source: Image.Image, mask: Image.Image) -> Image.Image:
    out = Image.new("RGBA", source.size, (0, 0, 0, 0))
    out.paste(source, mask=mask)
    return out


def register_source(img: Image.Image) -> Image.Image:
    """Map the 1208x1302 source onto the 873x940 canvas with sub-pixel accuracy.

    canvas(x, y) samples source((x - CX) / SCALE + SRC_CX, (y - CY) / SCALE + SRC_CY)
    """
    inv = 1.0 / SCALE
    a, b, cc = inv, 0.0, SRC_CX - CX * inv
    d, e, f = 0.0, inv, SRC_CY - CY * inv
    return img.transform((W, H), Image.Transform.AFFINE, (a, b, cc, d, e, f), Image.Resampling.BICUBIC)


# Everything inside this radius on L2 is replaced by dark-ring texture sampled
# from just beyond the white ring's glow (glow spans ~208-217 in the source).
L2_FILL_EDGE = R3_OUTER + 9.0      # 217
L2_FILL_FROM = R3_OUTER + 12.0     # 220: first radius that is pure dark ring


def fill_ring_inward(img: Image.Image) -> Image.Image:
    """Continue the dark gear ring inward: canvas pixels with r < L2_FILL_EDGE take
    the colour at r' = L2_FILL_FROM + (L2_FILL_EDGE - r) along the same angle."""
    src = np.asarray(img, dtype=np.uint8)
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    dx = xs - CX
    dy = ys - CY
    r = np.hypot(dx, dy)
    inside = r < L2_FILL_EDGE
    r_safe = np.where(r < 1e-3, 1e-3, r)
    r_new = np.where(inside, L2_FILL_FROM + (L2_FILL_EDGE - r), r)
    k = r_new / r_safe
    map_x = (CX + dx * k).astype(np.float32)
    map_y = (CY + dy * k).astype(np.float32)
    out = cv2.remap(src, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    return Image.fromarray(out, "RGBA")


def build_orb() -> Image.Image:
    """Scale the white disc so its solid radius == PUPIL_R, centre it on the pupil
    anchor, and trim the outer glow so the tangent edge is crisp."""
    disc = Image.open(ORB_SOURCE).convert("RGBA")
    s = PUPIL_R / ORB_SRC_R
    # Downscale with a proper prefilter (LANCZOS), then place so the disc centre
    # lands on the pupil anchor.
    small = disc.resize((round(disc.width * s), round(disc.height * s)), Image.Resampling.LANCZOS)
    placed = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    placed.alpha_composite(
        small, (round(PUPIL_X - ORB_SRC_CX * s), round(PUPIL_Y - ORB_SRC_CY * s))
    )
    trim = circle_mask(PUPIL_X, PUPIL_Y, PUPIL_R + 0.5, feather=1.5)
    r, g, bl, al = placed.split()
    al = Image.fromarray(
        (np.asarray(al, dtype=float) * np.asarray(trim, dtype=float) / 255.0).astype("uint8")
    )
    return Image.merge("RGBA", (r, g, bl, al))


def scale_about_center(image: Image.Image, factor: float) -> Image.Image:
    scaled = image.resize((round(W * factor), round(H * factor)), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    out.alpha_composite(scaled, (round(CX - CX * factor), round(CY - CY * factor)))
    return out


def assert_rgba_layer(name: str, image: Image.Image) -> dict[str, int]:
    if image.mode != "RGBA" or image.size != (W, H):
        raise RuntimeError(f"{name} is not an RGBA {W}x{H} image")
    values = list(image.getchannel("A").get_flattened_data())
    visible = sum(v > 0 for v in values)
    transparent = sum(v == 0 for v in values)
    if visible == 0 or transparent == 0:
        raise RuntimeError(f"{name} is not a usable transparent layer")
    return {"visible_pixels": visible, "transparent_pixels": transparent}


def main() -> None:
    for p in (SOURCE, ORB_SOURCE, BACKGROUND_SOURCE):
        if not p.is_file():
            raise FileNotFoundError(p)

    source = register_source(Image.open(SOURCE).convert("RGBA"))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    QA_OUTPUT.mkdir(parents=True, exist_ok=True)
    source.save(QA_OUTPUT / "source_registered.png")

    # Panoramic plate at native aspect; runtime cover-scales it to the window.
    background = Image.open(BACKGROUND_SOURCE).convert("RGBA")
    background.save(OUTPUT / "background.png")

    layers: dict[str, Image.Image] = {}
    report: dict[str, object] = {
        "scale_src_to_canvas": round(SCALE, 5),
        "pupil_radius": PUPIL_R,
        "pupil_base_r": round(PUPIL_BASE_R, 3),
        "r6_outer": round(R6_OUTER, 2),
        "breath_min": BREATH_MIN,
        "background": {"size": list(background.size), "mode": background.mode},
    }
    ring_source = fill_ring_inward(source)
    ring_source.save(QA_OUTPUT / "source_ring_filled.png")
    for name in ("layer_01", "layer_02", "layer_03", "layer_04", "layer_05", "layer_06"):
        inner, outer = MASK_RADII[name]
        base = ring_source if name == "layer_02" else source
        layer = rgba_with_mask(base, annulus_mask(inner, outer, FEATHER[name]))
        layers[name] = layer
        report[name] = assert_rgba_layer(name, layer)
        layer.save(OUTPUT / f"{name}.png")

    orb = build_orb()
    layers["layer_07"] = orb
    report["layer_07"] = assert_rgba_layer("layer_07", orb)
    orb.save(OUTPUT / "layer_07.png")

    angle = math.atan2(PUPIL_Y - CY, PUPIL_X - CX)
    PREVIEW_W, PREVIEW_H = 1280, 800
    EYE_FIT = 0.62
    for label, factor in (("static", 1.0), ("breath_min", BREATH_MIN), ("breath_max", BREATH_MAX)):
        preview = ImageOps.fit(background, (PREVIEW_W, PREVIEW_H), Image.Resampling.LANCZOS)
        eye_scale = (min(PREVIEW_W, PREVIEW_H) * EYE_FIT) / H
        eye = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        for name in LAYER_NAMES:
            if name == "layer_01":
                continue
            layer = layers[name]
            if name in {"layer_03", "layer_06"}:
                layer = scale_about_center(layer, factor)
            elif name == "layer_07":
                rim = PUPIL_BASE_R * factor
                placed = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                dx = round(CX + math.cos(angle) * rim - PUPIL_X)
                dy = round(CY + math.sin(angle) * rim - PUPIL_Y)
                placed.alpha_composite(layer, (dx, dy))
                layer = placed
            eye.alpha_composite(layer)
        ew, eh = round(W * eye_scale), round(H * eye_scale)
        eye_scaled = eye.resize((ew, eh), Image.Resampling.LANCZOS)
        ox = round(PREVIEW_W / 2 - CX * eye_scale)
        oy = round(PREVIEW_H / 2 - CY * eye_scale)
        preview.alpha_composite(eye_scaled, (ox, oy))
        preview.save(QA_OUTPUT / f"preview_{label}.png")

    meta = {
        "source": str(SOURCE.relative_to(ROOT)).replace("\\", "/"),
        "orb_source": str(ORB_SOURCE.relative_to(ROOT)).replace("\\", "/"),
        "background_source": str(BACKGROUND_SOURCE.relative_to(ROOT)).replace("\\", "/"),
        "canvas": [W, H],
        "center": [CX, CY],
        "layer_07_orb": [PUPIL_X, PUPIL_Y, PUPIL_R],
        "radii": {k: [round(v[0], 2), round(v[1], 2)] for k, v in RADII.items()},
        "mask_radii": {k: [round(v[0], 2), round(v[1], 2)] for k, v in MASK_RADII.items()},
        "breath": {"min": BREATH_MIN, "max": BREATH_MAX},
        "l7_tangent_rule": "R7 = breath_min * (pupil_base_r - R6_outer)",
        "rules": {
            "layer_01": "omitted in renderer",
            "layer_02": "clockwise rotation",
            "background": "static panoramic plate",
            "layer_03_to_layer_07": "translate as one eye-white group",
            "breathing_layers": ["layer_03", "layer_06"],
            "layer_04": "light-blue band, unscaled",
            "layer_05": "thin blue ring, unscaled",
            "layer_07": "white disc, rim-follow, unscaled",
        },
        "verification": report,
    }
    (OUTPUT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"scale={SCALE:.4f}  R6={R6_OUTER:.1f}  R5={R5_OUTER:.1f}  R4={R4_OUTER:.1f}  R3={R3_OUTER:.1f}  R2={R2_OUTER:.1f}")
    print(f"L7 radius={PUPIL_R}")
    print(f"Built layers_v4 in {OUTPUT}")


if __name__ == "__main__":
    main()
