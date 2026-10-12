// Build the banner slices and README.md from config.toml, the theme and the live stat.
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ConfigError, SCHEMES, load } from "./config";
import { LayoutError, widths, type Bar } from "./layout";
import { readme, type Paths } from "./readme";
import { loadFaces, render, slices, statText } from "./render";
import { StatError, fetchTotal } from "./stat";

// File names this build owns in assets/, with or without a content hash.
const OWN_SLICE = /^(top|left|middle|right)-(dark|light)(\.[0-9a-f]{8})?\.svg$/;

export function build(root: string, count: number, options: { fontsRoot?: string; today?: Date } = {}): Record<string, string> {
  const cfg = load(root, options.today);
  const faces = loadFaces(options.fontsRoot ?? root);
  const files: Record<string, string> = {};
  const paths = {} as Paths;
  let bar!: Bar;
  for (const scheme of SCHEMES) {
    const [svg, b] = render(cfg, scheme, count, faces);
    bar = b;
    const barSvg = cfg.effect ? render(cfg, scheme, count, faces, false)[0] : svg;
    for (const [name, part] of Object.entries(slices(svg, b, barSvg))) {
      // The content hash is part of the name: a changed image has a new URL,
      // so a browser cache can never pair an old image with a new README.
      const digest = createHash("sha256").update(part).digest("hex").slice(0, 8);
      const path = `assets/${name}-${scheme}.${digest}.svg`;
      files[path] = part;
      (paths[name as keyof Paths] ??= {} as Record<(typeof SCHEMES)[number], string>)[scheme] = path;
    }
  }
  // Bar geometry depends on text only, so both schemes share it.
  files["README.md"] = readme(cfg, widths(bar), paths);
  return files;
}

// Write every file under a temporary name, then move all into place. A write
// that fails leaves the previous files untouched, so the slices and README.md
// never end up as a mix of two builds.
function writeAll(root: string, files: Record<string, string>): void {
  const staged: [tmp: string, target: string][] = [];
  try {
    for (const [path, content] of Object.entries(files)) {
      const target = join(root, path);
      mkdirSync(dirname(target), { recursive: true });
      const tmp = `${target}.tmp`;
      writeFileSync(tmp, content, "utf8");
      staged.push([tmp, target]);
    }
    for (const [tmp, target] of staged) renameSync(tmp, target);
    // Slices from the previous build have other names now. Remove them.
    for (const old of readdirSync(join(root, "assets"))) {
      if (OWN_SLICE.test(old) && !(`assets/${old}` in files)) rmSync(join(root, "assets", old));
    }
  } finally {
    for (const [tmp] of staged) rmSync(tmp, { force: true });
  }
}

function parseArgs(argv: string[]): { count: number | null; root: string; today?: Date } {
  const args: { count: number | null; root: string; today?: Date } = { count: null, root: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i + 1];
    if (argv[i] === "--count" && value !== undefined && /^-?\d+$/.test(value)) args.count = Number(argv[++i]);
    else if (argv[i] === "--root" && value !== undefined) args.root = argv[++i];
    else if (argv[i] === "--date") {
      // Noon UTC: the calendar day is the same in every time zone the build could run in.
      const today = new Date(`${value}T12:00:00Z`);
      // The round trip rejects days that do not exist (02-30 would roll over to March).
      if (Number.isNaN(today.getTime()) || today.toISOString().slice(0, 10) !== value) throw new ConfigError("--date must be YYYY-MM-DD and a real calendar day");
      args.today = today;
      i++;
    } else throw new StatError(`usage: bun run build [--count N] [--root DIR] [--date YYYY-MM-DD], got ${argv[i]}`);
  }
  return args;
}

export async function main(argv: string[]): Promise<number> {
  let files: Record<string, string>;
  let count: number;
  let root: string;
  try {
    const args = parseArgs(argv);
    root = args.root;
    if (args.count !== null && args.count < 0) throw new StatError("count must be 0 or more");
    if (args.count === null) {
      const token = process.env.GITHUB_TOKEN;
      if (!token) throw new StatError("set GITHUB_TOKEN or pass --count");
      count = await fetchTotal(token);
    } else {
      count = args.count;
    }
    // Every output exists in memory before the first write.
    files = build(root, count, { today: args.today });
  } catch (error) {
    if (error instanceof ConfigError || error instanceof LayoutError || error instanceof StatError) {
      console.error(`build failed: ${error.message}`);
      return 1;
    }
    throw error;
  }
  try {
    writeAll(root, files);
  } catch (error) {
    console.error(`build failed: ${(error as Error).message}`);
    return 1;
  }
  console.log(`wrote ${Object.keys(files).length} files, ${statText(count)}`);
  return 0;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
