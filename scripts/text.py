"""Shape text with HarfBuzz and convert the glyphs to SVG path data.

Letters become outlines. A character the font cannot draw (in practice an
emoji) becomes a real <text> node in a fixed-width slot, drawn by the
viewer's system emoji font.
"""
from __future__ import annotations

import pathlib
from html import escape

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

SLOT_EM = 1.2
EMOJI_FONTS = "Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif"
ZWJ = 0x200D
VS16 = 0xFE0F    # asks for emoji presentation of the character before it
KEYCAP = 0x20E3
# Code points that extend the previous emoji: joiner, variation selector, keycap, skin tones, flag tags.
EXTENDERS = {ZWJ, VS16, KEYCAP} | set(range(0x1F3FB, 0x1F400)) | set(range(0xE0020, 0xE0080))


def _is_flag_letter(cp: int) -> bool:
    return 0x1F1E6 <= cp <= 0x1F1FF


def num(v: float) -> str:
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("", "-0") else s


class Face:
    def __init__(self, path):
        path = pathlib.Path(path)
        self.tt = TTFont(path)
        self.glyphs = self.tt.getGlyphSet()
        self.upem = self.tt["head"].unitsPerEm
        self.cmap = self.tt.getBestCmap()
        self.hb = hb.Font(hb.Face(path.read_bytes()))


def split_runs(face: Face, s: str) -> list[tuple[bool, str]]:
    runs: list[tuple[bool, str]] = []
    for ch in s:
        cp = ord(ch)
        last = runs[-1][1] if runs else ""
        in_slot = bool(runs) and runs[-1][0]
        if in_slot and (cp in EXTENDERS or ord(last[-1]) == ZWJ):
            runs[-1] = (True, last + ch)
        elif in_slot and _is_flag_letter(cp) and len(last) == 1 and _is_flag_letter(ord(last)):
            runs[-1] = (True, last + ch)
        elif cp in (VS16, KEYCAP) and last:
            # The character before it is one the font draws: move it into a slot of its own.
            runs.pop()
            if last[:-1]:
                runs.append((False, last[:-1]))
            runs.append((True, last[-1] + ch))
        elif cp in EXTENDERS:
            continue
        elif cp not in face.cmap:
            runs.append((True, ch))
        elif runs and not in_slot:
            runs[-1] = (False, last + ch)
        else:
            runs.append((False, ch))
    return runs


def _shape(face: Face, s: str, size: float, tracking: float):
    buf = hb.Buffer()
    buf.add_str(s)
    buf.guess_segment_properties()
    # Ligatures off: "->" in bar copy stays two characters.
    hb.shape(face.hb, buf, {"kern": True, "liga": False, "calt": False})
    scale = size / face.upem
    placed, x = [], 0.0
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        placed.append((face.tt.getGlyphName(info.codepoint), x + pos.x_offset * scale, pos.y_offset * scale))
        x += pos.x_advance * scale + tracking
    return placed, x


def measure(face: Face, s: str, size: float, tracking: float = 0.0) -> float:
    width = 0.0
    for slot, run in split_runs(face, s):
        width += SLOT_EM * size if slot else _shape(face, run, size, tracking)[1]
    return width


def draw(face: Face, s: str, x: float, y: float, size: float, fill: str, tracking: float = 0.0, cls: str = "") -> str:
    scale = size / face.upem
    attr = f' class="{cls}"' if cls else ""
    parts = []
    for slot, run in split_runs(face, s):
        if slot:
            width = SLOT_EM * size
            parts.append(
                f'<text x="{num(x + width / 2)}" y="{num(y)}" font-size="{num(size)}" '
                f'text-anchor="middle" font-family="{EMOJI_FONTS}" fill="{fill}">{escape(run)}</text>'
            )
            x += width
            continue
        placed, width = _shape(face, run, size, tracking)
        pen = SVGPathPen(face.glyphs, ntos=num)
        for name, gx, gy in placed:
            face.glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x + gx, y - gy)))
        d = pen.getCommands()
        if d:
            parts.append(f'<path{attr} fill="{fill}" d="{d}"/>')
        x += width
    return "".join(parts)
