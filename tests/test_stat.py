import pytest

from scripts import stat


def payload(*counts):
    return {"data": {"user": {f"y{2008 + i}": {"contributionCalendar": {"totalContributions": c}} for i, c in enumerate(counts)}}}


def test_query_has_one_alias_per_year_and_never_viewer():
    q = stat.query("achiurizo", 2008, 2026)
    assert 'user(login:"achiurizo")' in q and "viewer" not in q
    for year in range(2008, 2027):
        assert f'y{year}:contributionsCollection(from:"{year}-01-01T00:00:00Z",to:"{year}-12-31T23:59:59Z")' in q
    assert "y2027" not in q and "y2007" not in q


def test_total_sums_years():
    assert stat.total(payload(1, 27, 829)) == 857


def test_total_rejects_errors():
    with pytest.raises(stat.StatError, match="rate limited"):
        stat.total({"errors": [{"message": "rate limited"}], "data": None})


def test_total_rejects_null_user():
    with pytest.raises(stat.StatError, match="no user"):
        stat.total({"data": {"user": None}})


def test_total_rejects_missing_year():
    with pytest.raises(stat.StatError, match="y2009"):
        stat.total({"data": {"user": {"y2008": {"contributionCalendar": {"totalContributions": 1}}, "y2009": None}}})
