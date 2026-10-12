import math
import pathlib
import re
import shutil

import pytest

from scripts import build

ROOT = pathlib.Path(__file__).parent.parent


@pytest.fixture
def repo(tmp_path):
    for name in ("config.toml",):
        shutil.copy(ROOT / name, tmp_path / name)
    for name in ("themes", "fonts"):
        shutil.copytree(ROOT / name, tmp_path / name)
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
