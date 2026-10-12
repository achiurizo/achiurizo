"""Write the one-line README that lays the four banner slices edge to edge."""
from __future__ import annotations

from html import escape

from scripts.config import Config, Segment


def _picture(name: str, alt: str, width: str) -> str:
    return (
        f'<picture><source media="(prefers-color-scheme: dark)" srcset="assets/{name}-dark.svg">'
        f'<img src="assets/{name}-light.svg" alt="{escape(alt)}" width="{width}" align="top"></picture>'
    )


def _linked(picture: str, segment: Segment) -> str:
    if not segment.link:
        return picture
    title = f' title="{escape(segment.title)}"' if segment.title else ""
    return f'<a href="{escape(segment.link)}"{title}>{picture}</a>'


def readme(cfg: Config, pct: dict[str, str]) -> str:
    # No whitespace between tags: a space or newline would show as a gap between images.
    return (
        _picture("top", "achiurizo", "100%")
        + _linked(_picture("left", f"On GitHub {cfg.left.text}", pct["left"]), cfg.left)
        + _linked(_picture("middle", cfg.middle.text, pct["middle"]), cfg.middle)
        + _linked(_picture("right", "Contributions, all time", pct["right"]), cfg.right)
        + "\n"
    )
