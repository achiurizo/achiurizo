import hashlib
import math
import pathlib
import re
import shutil

import pytest

from scripts import build

ROOT = pathlib.Path(__file__).parent.parent
FIX = pathlib.Path(__file__).parent / "fixtures"
SLICE = re.compile(r"assets/(top|left|middle|right)-(dark|light)\.([0-9a-f]{8})\.svg")


@pytest.fixture
def repo(tmp_path):
    shutil.copy(FIX / "config.toml", tmp_path / "config.toml")
    shutil.copytree(FIX / "themes", tmp_path / "themes")
    shutil.copytree(ROOT / "fonts", tmp_path / "fonts")
    return tmp_path


def svgs(files):
    return {path: content for path, content in files.items() if path != "README.md"}


def on_disk(repo):
    return {f"assets/{p.name}": p.read_text() for p in (repo / "assets").iterdir()}


def test_build_returns_eight_hashed_slices_and_the_readme(repo):
    files = build.build(repo, 2875)
    assert "README.md" in files and len(files) == 9
    seen = set()
    for path, content in svgs(files).items():
        match = SLICE.fullmatch(path)
        assert match, path
        assert match.group(3) == hashlib.sha256(content.encode()).hexdigest()[:8]
        seen.add(match.group(1, 2))
    assert len(seen) == 8


def test_readme_points_at_exactly_the_built_slices(repo):
    files = build.build(repo, 2875)
    referenced = set(re.findall(r'(?:src|srcset)="(assets/[^"]+)"', files["README.md"]))
    assert referenced == set(svgs(files))


def test_changed_image_gets_a_new_name(repo):
    # A browser that cached the old image can never pair it with the new README.
    assert set(svgs(build.build(repo, 2875))).isdisjoint(svgs(build.build(repo, 2876)))


def test_readme_widths_match_slice_widths(repo):
    files = build.build(repo, 2875)
    readme_widths = re.findall(r'width="([0-9.]+)%"', files["README.md"])
    assert len(readme_widths) == 4 and readme_widths[0] == "100"
    dark = {SLICE.fullmatch(p).group(1): c for p, c in svgs(files).items() if "-dark." in p}
    for name, pct in zip(("left", "middle", "right"), readme_widths[1:]):
        px = int(re.match(r'<svg [^>]*viewBox="\d+ \d+ (\d+) 48"', dark[name]).group(1))
        assert float(pct) == math.floor(px / 846 * 10000) / 100


def test_main_writes_files_and_is_deterministic(repo):
    assert build.main(["--root", str(repo), "--count", "2875"]) == 0
    first = on_disk(repo)
    assert build.main(["--root", str(repo), "--count", "2875"]) == 0
    assert first == on_disk(repo)
    assert len(first) == 8
    assert (repo / "README.md").read_text().count("<picture>") == 4


def test_main_removes_slices_from_the_previous_build(repo):
    assert build.main(["--root", str(repo), "--count", "2875"]) == 0
    (repo / "assets" / "top-dark.svg").write_text("<svg/>")       # name from before hashing
    (repo / "assets" / "notes.txt").write_text("keep me")
    assert build.main(["--root", str(repo), "--count", "2876"]) == 0
    expected = build.build(repo, 2876)
    left = on_disk(repo)
    assert left.pop("assets/notes.txt") == "keep me"
    assert left == svgs(expected)
    assert (repo / "README.md").read_text() == expected["README.md"]


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
    for path in (repo / "assets").iterdir():
        path.chmod(0o444)
    assert build.main(["--root", str(repo), "--count", "9"]) == 0
    assert on_disk(repo) == svgs(build.build(repo, 9))


def test_unwritable_output_fails_cleanly(repo, capsys):
    (repo / "assets").write_text("not a directory")
    assert build.main(["--root", str(repo), "--count", "2875"]) == 1
    assert "build failed" in capsys.readouterr().err
    assert not (repo / "README.md").exists()


def test_negative_count_is_rejected(repo, capsys):
    assert build.main(["--root", str(repo), "--count", "-5"]) == 1
    assert "count must be 0 or more" in capsys.readouterr().err
    assert not (repo / "assets").exists()


def test_bad_config_reports_build_failed_not_a_traceback(repo, capsys):
    (repo / "config.toml").write_text("theme = 5\n")
    assert build.main(["--root", str(repo), "--count", "1"]) == 1
    assert capsys.readouterr().err.startswith("build failed: ")
