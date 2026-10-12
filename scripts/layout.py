"""Place the three powerline segments and choose the bar text size."""
from __future__ import annotations

import math
from dataclasses import dataclass

W, H = 846, 252
BAR_Y, BAR_H = 204, 48
PAD, ARROW, ICON, ICON_GAP = 16, 19, 24, 10
TEXT_INSET = 14   # space between the left segment's arrow tip and the middle text
MIN_GAP = 24      # bar background kept visible between the middle and right arrows
SIZES = (20, 19, 18, 17, 16)


class LayoutError(Exception):
    pass


@dataclass(frozen=True)
class Bar:
    size: int
    baseline: float
    left_x: float
    seg1_end: float
    middle_x: float
    seg2_end: float
    right_x: float
    seg3_start: float
    cut1: int
    cut2: int


def _place(regular, bold, left, middle, right, size):
    left_x = PAD + ICON + ICON_GAP
    seg1_end = left_x + regular(left, size) + PAD
    middle_x = seg1_end + ARROW + TEXT_INSET
    seg2_end = middle_x + bold(middle, size) + PAD
    right_x = W - PAD - regular(right, size)
    seg3_start = right_x - PAD
    slack = (seg3_start - ARROW) - (seg2_end + ARROW + MIN_GAP)
    return left_x, seg1_end, middle_x, seg2_end, right_x, seg3_start, slack


def bar(regular, bold, left: str, middle: str, right: str) -> Bar:
    for size in SIZES:
        left_x, seg1_end, middle_x, seg2_end, right_x, seg3_start, slack = _place(regular, bold, left, middle, right, size)
        if slack >= 0:
            return Bar(
                size=size,
                baseline=BAR_Y + BAR_H / 2 + size / 3,
                left_x=left_x, seg1_end=seg1_end, middle_x=middle_x, seg2_end=seg2_end,
                right_x=right_x, seg3_start=seg3_start,
                cut1=math.ceil(seg1_end + ARROW) + 4,
                cut2=round((seg2_end + ARROW + seg3_start - ARROW) / 2),
            )
    room = bold(middle, size) + slack
    budget = int(room // bold("m", size))
    if budget < 1:
        raise LayoutError(f"status bar copy does not fit at {size}px: the left text and the stat leave no room for the middle text")
    raise LayoutError(
        f"status bar copy does not fit at {size}px: middle text is {len(middle)} characters, the budget is {budget}"
    )


def _pct(px: float) -> str:
    return f"{math.floor(px / W * 10000) / 100:g}%"


def widths(b: Bar) -> dict[str, str]:
    return {"left": _pct(b.cut1), "middle": _pct(b.cut2 - b.cut1), "right": _pct(W - b.cut2)}
