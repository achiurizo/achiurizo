import pathlib
import shutil

import pytest

from scripts import config

ROOT = pathlib.Path(__file__).parent.parent


@pytest.fixture
def repo(tmp_path):
    shutil.copy(ROOT / "config.toml", tmp_path / "config.toml")
    shutil.copytree(ROOT / "themes", tmp_path / "themes")
    return tmp_path


def edit(path, old, new):
    text = path.read_text()
    assert old in text
    path.write_text(text.replace(old, new))


def test_loads_default(repo):
    cfg = config.load(repo)
    assert cfg.left.text == "since 2008"
    assert cfg.middle.text == "drifting thoughts of a model"
    assert cfg.middle.link == "https://github.com/achiurizo/dreeft"
    assert cfg.middle.title == "dreeft"
    assert cfg.right.text == "" and cfg.right.link is None
    for scheme in config.SCHEMES:
        assert set(cfg.theme[scheme]) == set(config.THEME_KEYS)


def test_default_theme_accent_is_on_the_middle_segment(repo):
    cfg = config.load(repo)
    for scheme in config.SCHEMES:
        t = cfg.theme[scheme]
        assert t["seg2_bg"] == t["cursor"]
        assert t["seg1_bg"] == t["seg3_bg"]


def test_missing_theme_key_fails(repo):
    edit(repo / "themes/default.toml", 'cursor = "#e058f5"\n', "")
    with pytest.raises(config.ConfigError, match=r"\[dark\] is missing cursor"):
        config.load(repo)


def test_unknown_theme_key_fails(repo):
    edit(repo / "themes/default.toml", "[light]", 'glow = "#ffffff"\n[light]')
    with pytest.raises(config.ConfigError, match=r"\[dark\] has unknown key glow"):
        config.load(repo)


def test_bad_color_fails(repo):
    edit(repo / "themes/default.toml", '"#e058f5"', '"magenta"')
    with pytest.raises(config.ConfigError, match="must be #rrggbb"):
        config.load(repo)


def test_missing_theme_file_fails(repo):
    edit(repo / "config.toml", 'theme = "default"', 'theme = "xmas"')
    with pytest.raises(config.ConfigError, match="themes/xmas.toml"):
        config.load(repo)


def test_theme_name_cannot_leave_themes_dir(repo):
    edit(repo / "config.toml", 'theme = "default"', 'theme = "../config"')
    with pytest.raises(config.ConfigError, match="theme name"):
        config.load(repo)


def test_rejects_non_https_link(repo):
    edit(repo / "config.toml", "https://github.com/achiurizo/dreeft", "javascript:alert(1)")
    with pytest.raises(config.ConfigError, match="must start with https://"):
        config.load(repo)


def test_rejects_empty_text(repo):
    edit(repo / "config.toml", '"drifting thoughts of a model"', '"  "')
    with pytest.raises(config.ConfigError, match="segments.middle.text is empty"):
        config.load(repo)


def test_rejects_non_string_segment_value(repo):
    edit(repo / "config.toml", 'title = "dreeft"', "title = 5")
    with pytest.raises(config.ConfigError, match="segments.middle.title must be a string"):
        config.load(repo)


def test_rejects_text_on_right_segment(repo):
    with (repo / "config.toml").open("a") as f:
        f.write('\n[segments.right]\ntext = "hello"\n')
    with pytest.raises(config.ConfigError, match="segments.right.text"):
        config.load(repo)
