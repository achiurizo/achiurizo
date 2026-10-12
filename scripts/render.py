"""Draw the full banner for one color scheme and cut it into four slices."""
from __future__ import annotations

import pathlib
from dataclasses import dataclass

from scripts import layout, text
from scripts.config import Config
from scripts.layout import ARROW, BAR_H, BAR_Y, H, ICON, PAD, W
from scripts.text import num

NAME = "achiurizo"
TITLE = "~/achiurizo"
TITLE_H = 36
# GitHub mark, Octicons mark-github-16 (MIT).
OCTO = (
    "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49"
    "-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82"
    ".72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15"
    "-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82"
    ".44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48"
    " 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
)
STYLE = (
    "<style>.cur{animation:blink 1.2s steps(1,end) infinite}"
    "@keyframes blink{0%,55%{opacity:1}56%,100%{opacity:0}}"
    "@media (prefers-reduced-motion:reduce){.cur{animation:none}}</style>"
)


def _head(x: int, y: int, w: int, h: int) -> str:
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}" width="{w}" height="{h}">'


FULL_HEAD = _head(0, 0, W, H)


@dataclass(frozen=True)
class Faces:
    display: text.Face
    mono: text.Face
    mono_bold: text.Face


def load_faces(root: pathlib.Path) -> Faces:
    fonts = root / "fonts"
    return Faces(
        display=text.Face(fonts / "BricolageGrotesque-800.ttf"),
        mono=text.Face(fonts / "JetBrainsMono-400.ttf"),
        mono_bold=text.Face(fonts / "JetBrainsMono-800.ttf"),
    )


def stat_text(count: int) -> str:
    return "1 contribution" if count == 1 else f"{count:,} contributions"


def _arrow(x: float, direction: int, fill: str) -> str:
    """Triangle whose flat side sits at x. direction 1 points right, -1 points left."""
    base = x - direction  # overlap the segment by 1px so no hairline shows
    tip = x + direction * ARROW
    mid = BAR_Y + BAR_H / 2
    return f'<polygon points="{num(base)},{BAR_Y} {num(tip)},{num(mid)} {num(base)},{BAR_Y + BAR_H}" fill="{fill}"/>'


def render(cfg: Config, scheme: str, count: int, faces: Faces) -> tuple[str, layout.Bar]:
    t = cfg.theme[scheme]
    right = stat_text(count) + cfg.right.suffix
    b = layout.bar(
        lambda s, size: text.measure(faces.mono, s, size),
        lambda s, size: text.measure(faces.mono_bold, s, size),
        cfg.left.text, cfg.middle.text, right,
    )
    name_w = text.measure(faces.display, NAME, 120, tracking=-4)
    title_x = W / 2 - text.measure(faces.mono, TITLE, 15) / 2
    icon_y = BAR_Y + (BAR_H - ICON) / 2
    parts = [
        FULL_HEAD,
        "<defs>", STYLE, f'<clipPath id="win"><rect width="{W}" height="{H}" rx="10"/></clipPath>', "</defs>",
        f'<rect x=".5" y=".5" width="{W - 1}" height="{H - 1}" rx="10" fill="{t["window_bg"]}"/>',
        f'<rect x="1" y="{TITLE_H}" width="{W - 2}" height="1" fill="{t["window_border"]}"/>',
        *(f'<circle cx="{cx}" cy="18" r="5.5" fill="none" stroke="{t["chrome"]}"/>' for cx in (22, 42, 62)),
        text.draw(faces.mono, TITLE, title_x, 23, 15, t["chrome"]),
        text.draw(faces.display, NAME, 20, 158, 120, t["wordmark"], tracking=-4),
        text.draw(faces.display, "_", 20 + name_w, 158, 120, t["cursor"], cls="cur"),
        '<g clip-path="url(#win)">',
        f'<rect x="0" y="{BAR_Y}" width="{W}" height="{BAR_H}" fill="{t["bar_bg"]}"/>',
        f'<rect x="{num(b.seg1_end)}" y="{BAR_Y}" width="{num(b.seg2_end - b.seg1_end)}" height="{BAR_H}" fill="{t["seg2_bg"]}"/>',
        _arrow(b.seg2_end, 1, t["seg2_bg"]),
        f'<rect x="0" y="{BAR_Y}" width="{num(b.seg1_end)}" height="{BAR_H}" fill="{t["seg1_bg"]}"/>',
        _arrow(b.seg1_end, 1, t["seg1_bg"]),
        f'<rect x="{num(b.seg3_start)}" y="{BAR_Y}" width="{num(W - b.seg3_start)}" height="{BAR_H}" fill="{t["seg3_bg"]}"/>',
        _arrow(b.seg3_start, -1, t["seg3_bg"]),
        "</g>",
        f'<path transform="translate({PAD},{num(icon_y)}) scale({num(ICON / 16)})" fill="{t["seg1_fg"]}" d="{OCTO}"/>',
        text.draw(faces.mono, cfg.left.text, b.left_x, b.baseline, b.size, t["seg1_fg"]),
        text.draw(faces.mono_bold, cfg.middle.text, b.middle_x, b.baseline, b.size, t["seg2_fg"]),
        text.draw(faces.mono, right, b.right_x, b.baseline, b.size, t["seg3_fg"]),
        f'<rect x=".5" y=".5" width="{W - 1}" height="{H - 1}" rx="10" fill="none" stroke="{t["window_border"]}"/>',
        "</svg>\n",
    ]
    return "".join(parts), b


def slices(svg: str, b: layout.Bar) -> dict[str, str]:
    if not svg.startswith(FULL_HEAD):
        raise ValueError("slices() needs the full banner from render()")
    body = svg[len(FULL_HEAD):]
    boxes = {
        "top": (0, 0, W, BAR_Y),
        "left": (0, BAR_Y, b.cut1, BAR_H),
        "middle": (b.cut1, BAR_Y, b.cut2 - b.cut1, BAR_H),
        "right": (b.cut2, BAR_Y, W - b.cut2, BAR_H),
    }
    return {name: _head(*box) + body for name, box in boxes.items()}
