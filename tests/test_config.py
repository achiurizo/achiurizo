import pathlib
import shutil

import pytest

from scripts import config

FIX = pathlib.Path(__file__).parent / "fixtures"


@pytest.fixture
def repo(tmp_path):
    shutil.copy(FIX / "config.toml", tmp_path / "config.toml")
    shutil.copytree(FIX / "themes", tmp_path / "themes")
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


@pytest.mark.parametrize("key", ["text", "title", "link"])
@pytest.mark.parametrize("bad", ["\\n", "\\t", "\\u0001", "\\u0085"])
def test_rejects_control_characters(repo, key, bad):
    old = {"text": '"drifting thoughts of a model"', "title": '"dreeft"', "link": '"https://github.com/achiurizo/dreeft"'}[key]
    edit(repo / "config.toml", old, old[:-1] + bad + '"')
    with pytest.raises(config.ConfigError, match=f"segments.middle.{key} holds a control character"):
        config.load(repo)


@pytest.mark.parametrize("link", ["https://", "https://example.com/a b", "https:///path"])
def test_rejects_incomplete_link(repo, link):
    edit(repo / "config.toml", "https://github.com/achiurizo/dreeft", link)
    with pytest.raises(config.ConfigError, match="segments.middle.link is not a complete https URL"):
        config.load(repo)


def test_missing_config_file_is_a_config_error(repo):
    (repo / "config.toml").unlink()
    with pytest.raises(config.ConfigError, match="config.toml not found"):
        config.load(repo)


def test_invalid_toml_is_a_config_error(repo):
    (repo / "config.toml").write_text('theme = "default\n')
    with pytest.raises(config.ConfigError, match="config.toml is not valid TOML"):
        config.load(repo)


def test_invalid_theme_toml_is_a_config_error(repo):
    (repo / "themes/default.toml").write_text("[dark\n")
    with pytest.raises(config.ConfigError, match="themes/default.toml is not valid TOML"):
        config.load(repo)


def test_theme_name_must_be_a_string(repo):
    edit(repo / "config.toml", 'theme = "default"', "theme = 5")
    with pytest.raises(config.ConfigError, match="theme name"):
        config.load(repo)


def test_segments_must_be_tables(repo):
    (repo / "config.toml").write_text('theme = "default"\nsegments = "x"\n')
    with pytest.raises(config.ConfigError, match="segments must be a table"):
        config.load(repo)
    (repo / "config.toml").write_text('theme = "default"\n[segments]\nleft = "x"\n')
    with pytest.raises(config.ConfigError, match="segments.left must be a table"):
        config.load(repo)


def test_unknown_top_level_key_fails(repo):
    edit(repo / "config.toml", 'theme = "default"', 'them = "default"')
    with pytest.raises(config.ConfigError, match="config.toml has unknown key them"):
        config.load(repo)


def test_unknown_segment_name_fails(repo):
    with (repo / "config.toml").open("a") as f:
        f.write('\n[segments.center]\ntext = "x"\n')
    with pytest.raises(config.ConfigError, match="unknown segment center"):
        config.load(repo)
