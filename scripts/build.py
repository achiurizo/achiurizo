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
    # Every output exists in memory before the first write.
    for path, content in files.items():
        target = args.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
    print(f"wrote {len(files)} files, {render.stat_text(count)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
