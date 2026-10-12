import pathlib
import xml.dom.minidom

import pytest

from scripts import text

FONTS = pathlib.Path(__file__).parent.parent / "fonts"


@pytest.fixture(scope="module")
def mono():
    return text.Face(FONTS / "JetBrainsMono-400.ttf")


@pytest.fixture(scope="module")
def display():
    return text.Face(FONTS / "BricolageGrotesque-800.ttf")


def test_num():
    assert text.num(1.0) == "1"
    assert text.num(1.005) in ("1", "1.01")
    assert text.num(-0.001) == "0"
    assert text.num(12.3456) == "12.35"


def test_measure_mono_is_cells(mono):
    assert text.measure(mono, "since 2008", 20) == pytest.approx(10 * 0.6 * 20)


def test_measure_tracking_adds_per_glyph(display):
    plain = text.measure(display, "achiurizo", 120)
    assert text.measure(display, "achiurizo", 120, tracking=-4) == pytest.approx(plain - 4 * 9)


def test_draw_returns_one_path_and_no_text(mono):
    out = text.draw(mono, "since 2008", 50, 234, 18, "#e6edf3")
    assert out.startswith('<path fill="#e6edf3" d="M')
    assert out.count("<path") == 1 and "<text" not in out


def test_draw_class_attribute(mono):
    assert text.draw(mono, "_", 0, 0, 18, "#fff", cls="cur").startswith('<path class="cur" fill="#fff"')


def test_draw_is_deterministic(display):
    a = text.draw(display, "achiurizo", 20, 158, 120, "#000", tracking=-4)
    assert a == text.draw(display, "achiurizo", 20, 158, 120, "#000", tracking=-4)


def test_draw_coordinates_have_two_decimals_at_most(display):
    out = text.draw(display, "achiurizo", 20.123456, 158, 120, "#000")
    import re
    assert not re.search(r"\d\.\d{3}", out)


def test_split_runs_plain(mono):
    assert text.split_runs(mono, "abc def") == [(False, "abc def")]


def test_split_runs_emoji_gets_own_slot(mono):
    assert text.split_runs(mono, "hi \U0001F525 there") == [(False, "hi "), (True, "\U0001F525"), (False, " there")]


def test_split_runs_joins_zwj_sequence(mono):
    family = "\U0001F468\u200D\U0001F469\u200D\U0001F467"
    thumbs = "\U0001F44D\U0001F3FD"
    flame = "\U0001F525\uFE0F"
    for cluster in (family, thumbs, flame):
        assert text.split_runs(mono, "a" + cluster + "b") == [(False, "a"), (True, cluster), (False, "b")]


def test_split_runs_keeps_flag_pairs_together(mono):
    japan = chr(0x1F1EF) + chr(0x1F1F5)
    france = chr(0x1F1EB) + chr(0x1F1F7)
    assert text.split_runs(mono, "a" + japan + france + "b") == [(False, "a"), (True, japan), (True, france), (False, "b")]


def test_split_runs_keeps_keycap_together(mono):
    keycap = "1" + chr(0xFE0F) + chr(0x20E3)
    assert text.split_runs(mono, "a" + keycap + "b") == [(False, "a"), (True, keycap), (False, "b")]


def test_split_runs_keeps_tag_sequence_together(mono):
    england = chr(0x1F3F4) + "".join(chr(0xE0000 + ord(c)) for c in "gbeng") + chr(0xE007F)
    assert text.split_runs(mono, england) == [(True, england)]


def test_split_runs_variation_selector_turns_a_letter_into_a_slot(mono):
    # U+FE0F asks for emoji presentation, so the character before it leaves the outlined run.
    assert text.split_runs(mono, "ab" + chr(0xFE0F) + "c") == [(False, "a"), (True, "b" + chr(0xFE0F)), (False, "c")]


def test_measure_counts_slot_width(mono):
    assert text.measure(mono, "a\U0001F525", 20) == pytest.approx(0.6 * 20 + text.SLOT_EM * 20)


def test_draw_emits_text_node_for_slot(mono):
    out = text.draw(mono, "a\U0001F525", 0, 20, 20, "#fff")
    assert out.count("<text") == 1 and "\U0001F525</text>" in out
    xml.dom.minidom.parseString(f"<g>{out}</g>")


def test_draw_output_parses_for_markup_characters(mono):
    # & < > " are in the font, so they become outlines and never reach the markup.
    out = text.draw(mono, 'a & <b> "c"', 0, 20, 20, "#fff")
    xml.dom.minidom.parseString(f"<g>{out}</g>")
    assert "<text" not in out and "&" not in out
