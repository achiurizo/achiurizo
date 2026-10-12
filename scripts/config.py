"""Load config.toml and the active theme, and reject anything malformed."""
from __future__ import annotations

import pathlib
import re
import tomllib
import urllib.parse
from dataclasses import dataclass

SCHEMES = ("dark", "light")
THEME_KEYS = (
    "window_bg", "window_border", "chrome", "wordmark", "cursor", "bar_bg",
    "seg1_bg", "seg1_fg", "seg2_bg", "seg2_fg", "seg3_bg", "seg3_fg",
)
HEX = re.compile(r"#[0-9a-fA-F]{6}")
THEME_NAME = re.compile(r"[a-z0-9_-]+")
SEGMENT_KEYS = {"text", "link", "title"}
SEGMENT_NAMES = ("left", "middle", "right")
TOP_KEYS = {"theme", "segments"}
# C0 and C1 control characters, line breaks included. One of these would break the
# SVG or split the one-line README.
CONTROL = re.compile(r"[\x00-\x1f\x7f-\x9f]")


class ConfigError(Exception):
    pass


@dataclass(frozen=True)
class Segment:
    text: str
    link: str | None = None
    title: str | None = None
    suffix: str = ""   # right segment only: text after the live stat


@dataclass(frozen=True)
class Config:
    theme: dict[str, dict[str, str]]
    left: Segment
    middle: Segment
    right: Segment


def _read_toml(path: pathlib.Path, label: str) -> dict:
    try:
        return tomllib.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise ConfigError(f"{label} not found") from None
    except (tomllib.TOMLDecodeError, UnicodeDecodeError) as error:
        raise ConfigError(f"{label} is not valid TOML: {error}") from None


def _check_link(link: str, name: str) -> None:
    if not link.startswith("https://"):
        raise ConfigError(f"segments.{name}.link must start with https://")
    try:
        host = urllib.parse.urlsplit(link).netloc
    except ValueError:
        host = ""
    if not host or any(ch.isspace() for ch in link):
        raise ConfigError(f"segments.{name}.link is not a complete https URL")


def _segment(raw: dict, name: str, takes_text: bool) -> Segment:
    if not isinstance(raw, dict):
        raise ConfigError(f"segments.{name} must be a table")
    allowed = SEGMENT_KEYS if takes_text else SEGMENT_KEYS | {"suffix"}
    unknown = sorted(set(raw) - allowed)
    if unknown:
        raise ConfigError(f"segments.{name} has unknown key {unknown[0]}")
    for key, value in raw.items():
        if not isinstance(value, str):
            raise ConfigError(f"segments.{name}.{key} must be a string")
        if CONTROL.search(value):
            raise ConfigError(f"segments.{name}.{key} holds a control character or a line break")
    text = raw.get("text", "")
    if takes_text and not text.strip():
        raise ConfigError(f"segments.{name}.text is empty")
    if not takes_text and text:
        raise ConfigError(f"segments.{name}.text is set by the live stat, remove it")
    link = raw.get("link")
    if link is not None:
        _check_link(link, name)
    return Segment(text, link, raw.get("title"), raw.get("suffix", ""))


def _theme(root: pathlib.Path, name: str) -> dict[str, dict[str, str]]:
    if not isinstance(name, str) or not THEME_NAME.fullmatch(name):
        raise ConfigError(f"theme name {name!r} may hold only a-z, 0-9, _ and -")
    path = root / "themes" / f"{name}.toml"
    if not path.is_file():
        raise ConfigError(f"theme file not found: themes/{name}.toml")
    raw = _read_toml(path, f"themes/{name}.toml")
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
    raw = _read_toml(root / "config.toml", "config.toml")
    for key in raw:
        if key not in TOP_KEYS:
            raise ConfigError(f"config.toml has unknown key {key}")
    segments = raw.get("segments", {})
    if not isinstance(segments, dict):
        raise ConfigError("segments must be a table")
    for name in segments:
        if name not in SEGMENT_NAMES:
            raise ConfigError(f"config.toml has unknown segment {name}")
    return Config(
        theme=_theme(root, raw.get("theme", "default")),
        left=_segment(segments.get("left", {}), "left", True),
        middle=_segment(segments.get("middle", {}), "middle", True),
        right=_segment(segments.get("right", {}), "right", False),
    )
