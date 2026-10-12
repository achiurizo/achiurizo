"""The live config and theme must build. No assertion here depends on their values."""
import pathlib

from scripts import build

ROOT = pathlib.Path(__file__).parent.parent


def test_live_config_builds():
    assert len(build.build(ROOT, 1234)) == 9


def test_every_theme_file_loads():
    # A holiday theme that is not active yet still gets checked.
    from scripts import config
    names = sorted(p.stem for p in (ROOT / "themes").glob("*.toml"))
    assert "default" in names
    for name in names:
        theme = config._theme(ROOT, name)
        assert set(theme) == set(config.SCHEMES)
