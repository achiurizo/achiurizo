import dataclasses
import pathlib
import xml.dom.minidom

import pytest

from scripts import config, layout, render

ROOT = pathlib.Path(__file__).parent.parent


@pytest.fixture(scope="module")
def faces():
    return render.load_faces(ROOT)


@pytest.fixture(scope="module")
def cfg():
    return config.load(ROOT)


def test_stat_text():
    assert render.stat_text(0) == "0 contributions"
    assert render.stat_text(1) == "1 contribution"
    assert render.stat_text(2875) == "2,875 contributions"
    assert render.stat_text(123456) == "123,456 contributions"


@pytest.mark.parametrize("scheme", config.SCHEMES)
def test_output_is_valid_outlined_svg(cfg, faces, scheme):
    svg, _ = render.render(cfg, scheme, 2875, faces)
    xml.dom.minidom.parseString(svg)
    assert svg.startswith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 846 252" width="846" height="252">')
    assert "@font-face" not in svg and "<text" not in svg
    assert "@media (prefers-reduced-motion:reduce){.cur{animation:none}}" in svg
    assert svg.count('class="cur"') == 1


def test_every_theme_key_is_consumed(cfg, faces):
    sentinel = {key: f"#0000{i:02x}" for i, key in enumerate(config.THEME_KEYS, start=1)}
    probe = dataclasses.replace(cfg, theme={"dark": sentinel, "light": sentinel})
    svg, _ = render.render(probe, "dark", 2875, faces)
    for key, color in sentinel.items():
        assert color in svg, key
    for scheme in config.SCHEMES:
        for color in cfg.theme[scheme].values():
            assert color not in svg


def test_render_is_deterministic(cfg, faces):
    assert render.render(cfg, "dark", 2875, faces)[0] == render.render(cfg, "dark", 2875, faces)[0]


def test_emoji_in_middle_renders_one_text_node(cfg, faces):
    probe = dataclasses.replace(cfg, middle=dataclasses.replace(cfg.middle, text="drifting \U0001F300 thoughts"))
    svg, _ = render.render(probe, "dark", 2875, faces)
    xml.dom.minidom.parseString(svg)
    assert svg.count("<text") == 1


def test_markup_characters_in_segment_text_stay_valid(cfg, faces):
    probe = dataclasses.replace(cfg, middle=dataclasses.replace(cfg.middle, text='a & <b> "c"'))
    svg, _ = render.render(probe, "dark", 2875, faces)
    xml.dom.minidom.parseString(svg)
    assert "<text" not in svg


@pytest.mark.parametrize("count", [0, 1, 999, 2875, 123456])
def test_counts_lay_out(cfg, faces, count):
    svg, b = render.render(cfg, "dark", count, faces)
    assert b.size >= 16
    assert b.cut1 < b.middle_x
    assert b.seg2_end + layout.ARROW < b.cut2 < b.seg3_start - layout.ARROW


def test_slices_change_only_the_viewbox(cfg, faces):
    svg, b = render.render(cfg, "dark", 2875, faces)
    parts = render.slices(svg, b)
    assert list(parts) == ["top", "left", "middle", "right"]
    assert parts["top"].startswith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 846 204" width="846" height="204">')
    assert parts["left"].startswith(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 204 {b.cut1} 48" width="{b.cut1}" height="48">')
    w = b.cut2 - b.cut1
    assert parts["middle"].startswith(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{b.cut1} 204 {w} 48" width="{w}" height="48">')
    w = layout.W - b.cut2
    assert parts["right"].startswith(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{b.cut2} 204 {w} 48" width="{w}" height="48">')
    body = svg.split(">", 1)[1]
    for part in parts.values():
        assert part.split(">", 1)[1] == body
        xml.dom.minidom.parseString(part)
