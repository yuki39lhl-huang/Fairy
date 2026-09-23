"""Redraw smooth white_ring + complete 4-corner plate for Fairy eye."""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageFilter

W = H = 1254
CX, CY = 627.0, 655.0
PUB = Path(r"E:\Fairy\Phaethon\ZeroFairyClient\src\renderer\public\fairy\layers")
IMG = Path(r"E:\Fairy\Phaethon\image\layers")
PREV = Path(r"E:\Fairy\Phaethon\ZeroFairyClient\tmp_fairy_frames")
PREV.mkdir(exist_ok=True)


def smoothstep(e0: float, e1: float, x: float) -> float:
    if e1 == e0:
        return 0.0 if x < e0 else 1.0
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3.0 - 2.0 * t)


def sd_rounded_box(px: float, py: float, half_w: float, half_h: float, radius: float) -> float:
    ax = abs(px) - half_w + radius
    ay = abs(py) - half_h + radius
    ox = max(ax, 0.0)
    oy = max(ay, 0.0)
    return math.hypot(ox, oy) + min(max(ax, ay), 0.0) - radius


def draw_white_ring() -> Image.Image:
    wr_in, wr_out = 191.0, 294.0
    feather = 2.6
    white = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    wp = white.load()
    assert wp is not None
    for y in range(H):
        for x in range(W):
            d = math.hypot(x - CX, y - CY)
            a_ring = smoothstep(wr_in - feather, wr_in + feather, d) * (
                1.0 - smoothstep(wr_out - feather, wr_out + feather, d)
            )
            if a_ring <= 0.001:
                continue
            t = (d - wr_in) / (wr_out - wr_in)
            scan = 0.93 + 0.07 * (0.5 + 0.5 * math.sin(y * 0.55))
            glow = 0.9 + 0.1 * math.sin(max(0.0, min(1.0, t)) * math.pi)
            lum = min(1.0, scan * glow)
            r = int(236 + 19 * lum)
            g = int(239 + 16 * lum)
            b = 250
            cyan = smoothstep(wr_out - 16, wr_out, d) * 0.22
            r = int(r * (1 - cyan) + 170 * cyan)
            g = int(g * (1 - cyan) + 215 * cyan)
            b = int(b * (1 - cyan) + 255 * cyan)
            wp[x, y] = (r, g, b, int(255 * a_ring))

    # soft outer bloom only
    bloom = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bp = bloom.load()
    assert bp is not None
    for y in range(H):
        for x in range(W):
            d = math.hypot(x - CX, y - CY)
            a = smoothstep(wr_out - 1, wr_out + 1, d) * (1.0 - smoothstep(wr_out + 1, wr_out + 18, d))
            if a <= 0.001:
                continue
            bp[x, y] = (150, 205, 255, int(55 * a))
    white = Image.alpha_composite(bloom, white)
    soft = white.filter(ImageFilter.GaussianBlur(0.7))
    return Image.alpha_composite(soft, white)


def draw_corner_plate() -> Image.Image:
    """Rounded square rotated 45° → four tips at N/E/S/W, complete (no missing tips)."""
    half = 252.0
    rad = 34.0
    feath = 2.0
    plate = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    pp = plate.load()
    assert pp is not None
    s2 = math.sqrt(0.5)
    for y in range(H):
        for x in range(W):
            dx = x - CX
            dy = y - CY
            lx = dx * s2 + dy * s2
            ly = -dx * s2 + dy * s2
            sd = sd_rounded_box(lx, ly, half, half, rad)
            outer_a = 1.0 - smoothstep(-feath, feath, sd)
            if outer_a <= 0.001:
                continue
            d = math.hypot(dx, dy)
            # hollow：挖掉中心，露出白环/眼心；d>~206 才保留板
            keep = smoothstep(200.0, 206.0, d)
            a = outer_a * keep
            if a <= 0.001:
                continue
            edge = 1.0 - smoothstep(-7.0, 1.5, sd)
            scan = 0.86 + 0.14 * (0.5 + 0.5 * math.sin(y * 0.42))
            base = 26 + 22 * edge
            r = int(base * 0.5 * scan)
            g = int(base * 1.0 * scan)
            b = int(base * 1.55 * scan + 18)
            pp[x, y] = (min(255, r), min(255, g), min(255, b), int(235 * a))

    # reinforce four tips so they never look chopped
    tip = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    tp = tip.load()
    assert tp is not None
    for deg in (0, 90, 180, 270):
        ang = math.radians(deg)
        tx = CX + math.cos(ang) * 330
        ty = CY + math.sin(ang) * 330
        ca, sa = math.cos(ang), math.sin(ang)
        for yy in range(int(ty - 55), int(ty + 56)):
            for xx in range(int(tx - 55), int(tx + 56)):
                if not (0 <= xx < W and 0 <= yy < H):
                    continue
                lx = (xx - tx) * ca + (yy - ty) * sa
                ly = -(xx - tx) * sa + (yy - ty) * ca
                if lx < -10 or lx > 48:
                    continue
                half_w = 26 * max(0.05, 1.0 - (lx + 10) / 58)
                if abs(ly) > half_w + 2:
                    continue
                aa = (1.0 - abs(ly) / (half_w + 0.01)) * (1.0 - max(0.0, lx) / 48.0)
                aa = max(0.0, min(1.0, aa))
                if aa < 0.04:
                    continue
                r0, g0, b0, a0 = pp[xx, yy]
                tp[xx, yy] = (
                    max(r0, int(36 + 30 * aa)),
                    max(g0, int(62 + 40 * aa)),
                    max(b0, int(100 + 50 * aa)),
                    min(255, max(a0, int(210 * aa))),
                )
    plate = Image.alpha_composite(plate, tip)
    soft = plate.filter(ImageFilter.GaussianBlur(0.55))
    return Image.alpha_composite(soft, plate)


def main() -> None:
    print("drawing white ring...")
    white = draw_white_ring()
    print("drawing corner plate...")
    corners = draw_corner_plate()

    white.save(PUB / "white_ring.png")
    corners.save(PUB / "corner_plate.png")
    white.save(IMG / "white_ring.png")
    corners.save(IMG / "corner_plate.png")
    print("saved assets", (PUB / "white_ring.png").stat().st_size, (PUB / "corner_plate.png").stat().st_size)

    comp = Image.new("RGBA", (W, H), (6, 18, 40, 255))
    for name in ["outer_halo", "outer_rim", "corner_plate", "blue_inner", "core", "white_ring"]:
        path = PUB / f"{name}.png"
        if path.exists():
            comp = Image.alpha_composite(comp, Image.open(path).convert("RGBA"))
    pup = Image.open(PUB / "pupil.png").convert("RGBA")
    comp.alpha_composite(pup, (735 - pup.size[0] // 2, 786 - pup.size[1] // 2))
    comp.convert("RGB").resize((720, 720)).save(PREV / "redraw_preview.jpg", quality=93)
    print("preview ok")


if __name__ == "__main__":
    main()
