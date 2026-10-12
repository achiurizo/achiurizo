import { expect, test } from "bun:test";
import { SCHEMES, load, type Config } from "../src/config";
import { readme, type Paths } from "../src/readme";
import { FIX } from "./helpers";

const PCT = { left: "23.28%", middle: "43.61%", right: "33.09%" };
const PATHS = Object.fromEntries(
  ["top", "left", "middle", "right"].map((name) => [name, Object.fromEntries(SCHEMES.map((s) => [s, `assets/${name}-${s}.0a1b2c3d.svg`]))]),
) as Paths;
const cfg = load(FIX);
const out = (c: Config = cfg) => readme(c, PCT, PATHS);

test("the README is one line with no gaps between tags", () => {
  expect(out().endsWith("\n")).toBe(true);
  expect(out().match(/\n/g)).toHaveLength(1);
  expect(out()).not.toMatch(/>\s+</);
});

test("four pictures with align top and widths", () => {
  expect(out().match(/<picture>/g)).toHaveLength(4);
  expect(out().match(/align="top"/g)).toHaveLength(4);
  expect([...out().matchAll(/width="([^"]+)"/g)].map((m) => m[1])).toEqual(["100%", "23.28%", "43.61%", "33.09%"]);
  expect(out().match(/media="\(prefers-color-scheme: dark\)"/g)).toHaveLength(4);
  expect(out()).not.toContain("max-width");
});

test("the README uses the given image paths", () => {
  for (const name of ["top", "left", "middle", "right"]) {
    expect(out()).toContain(`srcset="assets/${name}-dark.0a1b2c3d.svg"`);
    expect(out()).toContain(`src="assets/${name}-light.0a1b2c3d.svg"`);
  }
});

test("only the middle segment is linked", () => {
  expect(out().match(/<a /g)).toHaveLength(1);
  expect(out()).toContain(
    '<a href="https://github.com/achiurizo/dreeft" title="dreeft"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/middle-dark.0a1b2c3d.svg">',
  );
});

test("a segment without a link is bare", () => {
  expect(out({ ...cfg, middle: { ...cfg.middle, link: null } })).not.toContain("<a ");
});

test("attributes are escaped", () => {
  const probe: Config = { ...cfg, middle: { text: 'a "b" <c> & d', link: "https://example.com/?a=1&b=2", title: 'say "hi"', suffix: "" } };
  expect(out(probe)).toContain('alt="a &quot;b&quot; &lt;c&gt; &amp; d"');
  expect(out(probe)).toContain('href="https://example.com/?a=1&amp;b=2"');
  expect(out(probe)).toContain('title="say &quot;hi&quot;"');
});
