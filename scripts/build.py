"""Build the banner slices and README.md from config.toml, the theme and the live stat."""
from __future__ import annotations

import argparse
import os
import pathlib
import sys

from scripts import config, layout, readme, render, stat


def build(root: pathlib.Path, count: int) -> dict[str, str]:
    cfg = config.load(root)
    faces = render.load_faces(root)
    files: dict[str, str] = {}
    for scheme in config.SCHEMES:
        svg, bar = render.render(cfg, scheme, count, faces)
        for name, part in render.slices(svg, bar).items():
            files[f"assets/{name}-{scheme}.svg"] = part
    # Bar geometry depends on text only, so both schemes share it.
    files["README.md"] = readme.readme(cfg, layout.widths(bar))
    return files


def _write_all(root: pathlib.Path, files: dict[str, str]) -> None:
    """Write every file under a temporary name, then move all into place.

    A write that fails leaves the previous files untouched, so the slices and
    README.md never end up as a mix of two builds.
    """
    staged: list[tuple[pathlib.Path, pathlib.Path]] = []
    try:
        for path, content in files.items():
            target = root / path
            target.parent.mkdir(parents=True, exist_ok=True)
            tmp = target.with_name(target.name + ".tmp")
            tmp.write_text(content, encoding="utf-8", newline="\n")
            staged.append((tmp, target))
        for tmp, target in staged:
            os.replace(tmp, target)
    finally:
        for tmp, _ in staged:
            tmp.unlink(missing_ok=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, help="contribution count; fetched from GitHub when absent")
    parser.add_argument("--root", type=pathlib.Path, default=pathlib.Path.cwd())
    args = parser.parse_args(argv)
    try:
        count = args.count
        if count is None:
            token = os.environ.get("GITHUB_TOKEN")
            if not token:
                raise stat.StatError("set GITHUB_TOKEN or pass --count")
            count = stat.fetch(token)
        files = build(args.root, count)
    except (config.ConfigError, layout.LayoutError, stat.StatError) as error:
        print(f"build failed: {error}", file=sys.stderr)
        return 1
    try:
        _write_all(args.root, files)
    except OSError as error:
        print(f"build failed: {error}", file=sys.stderr)
        return 1
    print(f"wrote {len(files)} files, {render.stat_text(count)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
