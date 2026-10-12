import pytest

from scripts import layout


def cells(s, size):
    return len(s) * 0.6 * size


LEFT, MIDDLE = "since 2008", "drifting thoughts of a model"


def test_default_copy_fits_at_18():
    b = layout.bar(cells, cells, LEFT, MIDDLE, "2,875 contributions")
    assert b.size == 18
    assert b.left_x == 50
    assert b.seg1_end == pytest.approx(174)
    assert b.middle_x == pytest.approx(207)


def test_short_copy_uses_20():
    assert layout.bar(cells, cells, LEFT, "terminal automation", "2,875 contributions").size == 20


def test_segments_never_overlap():
    for right in ("999 contributions", "2,875 contributions", "123,456 contributions", "0 contributions", "1 contribution"):
        b = layout.bar(cells, cells, LEFT, MIDDLE, right)
        assert b.seg1_end + layout.ARROW < b.cut1 < b.middle_x
        assert b.seg2_end + layout.ARROW < b.cut2 < b.seg3_start - layout.ARROW
        assert b.right_x + cells(right, b.size) == pytest.approx(layout.W - layout.PAD)


def test_too_long_copy_fails_with_budget():
    with pytest.raises(layout.LayoutError, match=r"middle text takes 60 character cells, the budget is \d+"):
        layout.bar(cells, cells, LEFT, "x" * 60, "2,875 contributions")


def test_long_left_text_is_named_as_the_cause():
    with pytest.raises(layout.LayoutError, match="left text and the stat leave no room"):
        layout.bar(cells, cells, "x" * 70, "m", "2,875 contributions")


def test_widths_sum_to_just_under_100():
    w = layout.widths(layout.bar(cells, cells, LEFT, MIDDLE, "2,875 contributions"))
    total = sum(float(v.rstrip("%")) for v in w.values())
    assert 99.9 < total <= 100
    assert set(w) == {"left", "middle", "right"}
    assert all(v.endswith("%") for v in w.values())


def test_budget_message_counts_cells_not_code_points():
    # The measuring function, not len(), decides how wide the copy is: an emoji slot is two cells.
    def wide(s, size):
        return sum(1.2 if ch == "x" else 0.6 for ch in s) * size
    with pytest.raises(layout.LayoutError, match=r"middle text takes 120 character cells"):
        layout.bar(cells, wide, LEFT, "x" * 60, "2,875 contributions")
