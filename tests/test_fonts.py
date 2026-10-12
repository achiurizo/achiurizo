import pathlib

import pytest
from fontTools.ttLib import TTFont

FONTS = pathlib.Path(__file__).parent.parent / "fonts"


@pytest.mark.parametrize("name", ["BricolageGrotesque-800.ttf", "JetBrainsMono-400.ttf", "JetBrainsMono-800.ttf"])
def test_font_is_static_and_covers_ascii(name):
    font = TTFont(FONTS / name)
    assert "fvar" not in font
    cmap = font.getBestCmap()
    for ch in "achiurizo_~/ since2008,contributions":
        assert ord(ch) in cmap, ch


def test_mono_is_monospace():
    font = TTFont(FONTS / "JetBrainsMono-400.ttf")
    widths = {font["hmtx"][font.getBestCmap()[ord(c)]][0] for c in "il mW0,"}
    assert len(widths) == 1


def test_licenses_are_vendored():
    assert (FONTS / "OFL-BricolageGrotesque.txt").read_text().startswith("Copyright")
    assert (FONTS / "OFL-JetBrainsMono.txt").read_text().startswith("Copyright")
