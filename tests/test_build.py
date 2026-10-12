import math
import pathlib
import re
import shutil

import pytest

from scripts import build

ROOT = pathlib.Path(__file__).parent.parent
FIX = pathlib.Path(__file__).parent / "fixtures"


@pytest.fixture
def repo(tmp_path):
    shutil.copy(FIX / "config.toml", tmp_path / "config.toml")
    shutil.copytree(FIX / "themes", tmp_path / "themes")
    shutil.copytree(ROOT / "fonts", tmp_path / "fonts")
    return tmp_path


def test_build_returns_nine_files(repo):
    files = build.build(repo, 2875)
    assert sorted(files) == sorted(
        ["README.md"] + [f"assets/{n}-{s}.svg" for n in ("top", "left", "middle", "right") for s in ("dark", "light")]
    )


def test_readme_widths_match_slice_widths(repo):
    files = build.build(repo, 2875)
    readme_widths = re.findall(r'width="([0-9.]+)%"', files["README.md"])
    assert len(readme_widths) == 4 and readme_widths[0] == "100"
    for name, pct in zip(("left", "middle", "right"), readme_widths[1:]):
        px = int(re.match(r'<svg [^>]*viewBox="\d+ \d+ (\d+) 48"', files[f"assets/{name}-dark.svg"]).group(1))
        assert float(pct) == math.floor(px / 846 * 10000) / 100


def test_main_writes_files_and_is_deterministic(repo):
    assert build.main(["--root", str(repo), "--count", "2875"]) == 0
    first = {p.name: p.read_bytes() for p in (repo / "assets").iterdir()}
    assert build.main(["--root", str(repo), "--count", "2875"]) == 0
    assert first == {p.name: p.read_bytes() for p in (repo / "assets").iterdir()}
    assert len(first) == 8
    assert (repo / "README.md").read_text().count("<picture>") == 4


def test_main_writes_nothing_on_failure(repo, capsys):
    (repo / "config.toml").write_text(
        'theme = "default"\n[segments.left]\ntext = "since 2008"\n[segments.middle]\ntext = "' + "x" * 80 + '"\n'
    )
    assert build.main(["--root", str(repo), "--count", "2875"]) == 1
    assert not (repo / "assets").exists() and not (repo / "README.md").exists()
    assert "budget" in capsys.readouterr().err


def test_main_fails_without_token_or_count(repo, monkeypatch, capsys):
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    assert build.main(["--root", str(repo)]) == 1
    assert "GITHUB_TOKEN" in capsys.readouterr().err
    assert not (repo / "assets").exists()


def test_read_only_asset_does_not_leave_a_mixed_set(repo):
    assert build.main(["--root", str(repo), "--count", "2875"]) == 0
    (repo / "assets" / "middle-dark.svg").chmod(0o444)
    assert build.main(["--root", str(repo), "--count", "9"]) == 0
    expected = build.build(repo, 9)
    for path, content in expected.items():
        assert (repo / path).read_text() == content, path


def test_unwritable_output_fails_cleanly(repo, capsys):
    (repo / "assets").write_text("not a directory")
    assert build.main(["--root", str(repo), "--count", "2875"]) == 1
    assert "build failed" in capsys.readouterr().err
    assert not (repo / "README.md").exists()
