"""The live config and theme must build. No assertion here depends on their values."""
import pathlib

from scripts import build

ROOT = pathlib.Path(__file__).parent.parent


def test_live_config_builds():
    assert len(build.build(ROOT, 1234)) == 9
