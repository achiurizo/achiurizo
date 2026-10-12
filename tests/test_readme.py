import dataclasses
import pathlib
import re

from scripts import config, readme

FIX = pathlib.Path(__file__).parent / "fixtures"
PCT = {"left": "23.28%", "middle": "43.61%", "right": "33.09%"}


def test_readme_is_one_line_with_no_gaps_between_tags():
    out = readme.readme(config.load(FIX), PCT)
    assert out.endswith("\n") and out.count("\n") == 1
    assert not re.search(r">\s+<", out)


def test_readme_has_four_pictures_with_align_top_and_widths():
    out = readme.readme(config.load(FIX), PCT)
    assert out.count("<picture>") == 4
    assert out.count('align="top"') == 4
    assert re.findall(r'width="([^"]+)"', out) == ["100%", "23.28%", "43.61%", "33.09%"]
    assert out.count('media="(prefers-color-scheme: dark)"') == 4
    assert "max-width" not in out
    for name in ("top", "left", "middle", "right"):
        assert f'srcset="assets/{name}-dark.svg"' in out and f'src="assets/{name}-light.svg"' in out


def test_only_the_middle_segment_is_linked():
    out = readme.readme(config.load(FIX), PCT)
    assert out.count("<a ") == 1
    assert '<a href="https://github.com/achiurizo/dreeft" title="dreeft"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/middle-dark.svg">' in out


def test_segment_without_link_is_bare():
    cfg = config.load(FIX)
    cfg = dataclasses.replace(cfg, middle=dataclasses.replace(cfg.middle, link=None))
    assert "<a " not in readme.readme(cfg, PCT)


def test_readme_escapes_attributes():
    cfg = config.load(FIX)
    cfg = dataclasses.replace(cfg, middle=config.Segment('a "b" <c> & d', "https://example.com/?a=1&b=2", 'say "hi"'))
    out = readme.readme(cfg, PCT)
    assert 'alt="a &quot;b&quot; &lt;c&gt; &amp; d"' in out
    assert 'href="https://example.com/?a=1&amp;b=2"' in out
    assert 'title="say &quot;hi&quot;"' in out
