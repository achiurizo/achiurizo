"""Load config.toml and the active theme, and reject anything malformed."""
from __future__ import annotations

import pathlib
import re
import tomllib
from dataclasses import dataclass

SCHEMES = ("dark", "light")
THEME_KEYS = (
    "window_bg", "window_border", "chrome", "wordmark", "cursor", "bar_bg",
    "seg1_bg", "seg1_fg", "seg2_bg", "seg2_fg", "seg3_bg", "seg3_fg",
)
HEX = re.compile(r"#[0-9a-fA-F]{6}")
THEME_NAME = re.compile(r"[a-z0-9_-]+")
SEGMENT_KEYS = {"text", "link", "title"}


class ConfigError(Exception):
    pass


@dataclass(frozen=True)
class Segment:
    text: str
    link: str | None = None
    title: str | None = None


@dataclass(frozen=True)
class Config:
    theme: dict[str, dict[str, str]]
    left: Segment
    middle: Segment
    right: Segment


def _segment(raw: dict, name: str, takes_text: bool) -> Segment:
    unknown = sorted(set(raw) - SEGMENT_KEYS)
    if unknown:
        raise ConfigError(f"segments.{name} has unknown key {unknown[0]}")
    for key, value in raw.items():
        if not isinstance(value, str):
            raise ConfigError(f"segments.{name}.{key} must be a string")
    text = raw.get("text", "")
    if takes_text and not text.strip():
        raise ConfigError(f"segments.{name}.text is empty")
    if not takes_text and text:
        raise ConfigError(f"segments.{name}.text is set by the live stat, remove it")
    link = raw.get("link")
    if link is not None and not link.startswith("https://"):
        raise ConfigError(f"segments.{name}.link must start with https://")
    return Segment(text, link, raw.get("title"))


def _theme(root: pathlib.Path, name: str) -> dict[str, dict[str, str]]:
    if not THEME_NAME.fullmatch(name):
        raise ConfigError(f"theme name {name!r} may hold only a-z, 0-9, _ and -")
    path = root / "themes" / f"{name}.toml"
    if not path.is_file():
        raise ConfigError(f"theme file not found: themes/{name}.toml")
    raw = tomllib.loads(path.read_text())
    theme = {}
    for scheme in SCHEMES:
        table = raw.get(scheme)
        if not isinstance(table, dict):
            raise ConfigError(f"themes/{name}.toml has no [{scheme}] table")
        for key in THEME_KEYS:
            if key not in table:
                raise ConfigError(f"themes/{name}.toml [{scheme}] is missing {key}")
        for key, value in table.items():
            if key not in THEME_KEYS:
                raise ConfigError(f"themes/{name}.toml [{scheme}] has unknown key {key}")
            if not isinstance(value, str) or not HEX.fullmatch(value):
                raise ConfigError(f"themes/{name}.toml [{scheme}] {key} must be #rrggbb")
        theme[scheme] = dict(table)
    return theme


def load(root: pathlib.Path) -> Config:
    raw = tomllib.loads((root / "config.toml").read_text())
    segments = raw.get("segments", {})
    return Config(
        theme=_theme(root, raw.get("theme", "default")),
        left=_segment(segments.get("left", {}), "left", True),
        middle=_segment(segments.get("middle", {}), "middle", True),
        right=_segment(segments.get("right", {}), "right", False),
    )
