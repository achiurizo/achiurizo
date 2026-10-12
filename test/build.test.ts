import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build, main } from "../src/build";
import { tempRepo } from "./helpers";

const SLICE = /^assets\/(top|left|middle|right)-(dark|light)\.([0-9a-f]{8})\.svg$/;
const svgs = (files: Record<string, string>) => Object.fromEntries(Object.entries(files).filter(([path]) => path !== "README.md"));
const onDisk = (repo: string) =>
  Object.fromEntries(readdirSync(join(repo, "assets")).map((name) => [`assets/${name}`, readFileSync(join(repo, "assets", name), "utf8")]));

let errors: string[] = [];
let spies: { mockRestore(): void }[] = [];
beforeEach(() => {
  errors = [];
  spies = [
    spyOn(console, "error").mockImplementation((...args: unknown[]) => void errors.push(args.join(" "))),
    spyOn(console, "log").mockImplementation(() => {}),
  ];
});
afterEach(() => spies.forEach((spy) => spy.mockRestore()));

test("build returns eight hashed slices and the README", () => {
  const files = build(tempRepo(), 2875);
  expect(Object.keys(files)).toHaveLength(9);
  expect(files["README.md"]).toBeDefined();
  const seen = new Set<string>();
  for (const [path, content] of Object.entries(svgs(files))) {
    const match = SLICE.exec(path);
    expect(match, path).not.toBeNull();
    expect(match![3]).toBe(createHash("sha256").update(content).digest("hex").slice(0, 8));
    seen.add(`${match![1]}-${match![2]}`);
  }
  expect(seen.size).toBe(8);
});

test("the README points at exactly the built slices", () => {
  const files = build(tempRepo(), 2875);
  const referenced = [...files["README.md"].matchAll(/(?:src|srcset)="(assets\/[^"]+)"/g)].map((m) => m[1]);
  expect(referenced.sort()).toEqual(Object.keys(svgs(files)).sort());
});

test("a changed image gets a new name", () => {
  // A browser that cached the old image can never pair it with the new README.
  const repo = tempRepo();
  const before = Object.keys(svgs(build(repo, 2875)));
  const after = Object.keys(svgs(build(repo, 2876)));
  expect(before.filter((path) => after.includes(path))).toEqual([]);
});

test("README widths match slice widths", () => {
  const files = build(tempRepo(), 2875);
  const widths = [...files["README.md"].matchAll(/width="([0-9.]+)%"/g)].map((m) => m[1]);
  expect(widths).toHaveLength(4);
  expect(widths[0]).toBe("100");
  ["left", "middle", "right"].forEach((name, i) => {
    const [, content] = Object.entries(files).find(([path]) => path.startsWith(`assets/${name}-dark.`))!;
    const px = Number(/^<svg [^>]*viewBox="\d+ \d+ (\d+) 48"/.exec(content)![1]);
    expect(Number(widths[i + 1])).toBe(Math.floor((px / 846) * 10000) / 100);
  });
});

test("main writes files and is deterministic", async () => {
  const repo = tempRepo();
  expect(await main(["--root", repo, "--count", "2875"])).toBe(0);
  const first = onDisk(repo);
  expect(await main(["--root", repo, "--count", "2875"])).toBe(0);
  expect(onDisk(repo)).toEqual(first);
  expect(Object.keys(first)).toHaveLength(8);
  expect(readFileSync(join(repo, "README.md"), "utf8").match(/<picture>/g)).toHaveLength(4);
});

test("main removes slices from the previous build", async () => {
  const repo = tempRepo();
  expect(await main(["--root", repo, "--count", "2875"])).toBe(0);
  writeFileSync(join(repo, "assets/top-dark.svg"), "<svg/>"); // name from before hashing
  writeFileSync(join(repo, "assets/notes.txt"), "keep me");
  expect(await main(["--root", repo, "--count", "2876"])).toBe(0);
  const expected = build(repo, 2876);
  const left = onDisk(repo);
  expect(left["assets/notes.txt"]).toBe("keep me");
  delete left["assets/notes.txt"];
  expect(left).toEqual(svgs(expected));
  expect(readFileSync(join(repo, "README.md"), "utf8")).toBe(expected["README.md"]);
});

test("main writes nothing when the copy does not fit", async () => {
  const repo = tempRepo();
  writeFileSync(join(repo, "config.toml"), `theme = "default"\n[segments.left]\ntext = "since 2008"\n[segments.middle]\ntext = "${"x".repeat(80)}"\n`);
  expect(await main(["--root", repo, "--count", "2875"])).toBe(1);
  expect(existsSync(join(repo, "assets"))).toBe(false);
  expect(existsSync(join(repo, "README.md"))).toBe(false);
  expect(errors.join("\n")).toContain("budget");
});

test("main fails without a token or a count", async () => {
  const repo = tempRepo();
  const saved = process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;
  try {
    expect(await main(["--root", repo])).toBe(1);
  } finally {
    if (saved !== undefined) process.env.GITHUB_TOKEN = saved;
  }
  expect(errors.join("\n")).toContain("GITHUB_TOKEN");
  expect(existsSync(join(repo, "assets"))).toBe(false);
});

test("a read-only asset does not leave a mixed set", async () => {
  const repo = tempRepo();
  expect(await main(["--root", repo, "--count", "2875"])).toBe(0);
  for (const name of readdirSync(join(repo, "assets"))) chmodSync(join(repo, "assets", name), 0o444);
  expect(await main(["--root", repo, "--count", "9"])).toBe(0);
  expect(onDisk(repo)).toEqual(svgs(build(repo, 9)));
});

test("an unwritable output directory fails cleanly", async () => {
  const repo = tempRepo();
  writeFileSync(join(repo, "assets"), "not a directory");
  expect(await main(["--root", repo, "--count", "2875"])).toBe(1);
  expect(errors.join("\n")).toContain("build failed");
  expect(existsSync(join(repo, "README.md"))).toBe(false);
});

test("a negative count is rejected", async () => {
  const repo = tempRepo();
  expect(await main(["--root", repo, "--count", "-5"])).toBe(1);
  expect(errors.join("\n")).toContain("count must be 0 or more");
  expect(existsSync(join(repo, "assets"))).toBe(false);
});

test("a bad config reports build failed, not a stack trace", async () => {
  const repo = tempRepo();
  writeFileSync(join(repo, "config.toml"), "theme = 5\n");
  expect(await main(["--root", repo, "--count", "1"])).toBe(1);
  expect(errors[0].startsWith("build failed: ")).toBe(true);
});
