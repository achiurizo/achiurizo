// The live config, themes and fonts must build. No assertion here depends on their values.
import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { build } from "../src/build";
import { SCHEMES, loadTheme } from "../src/config";
import { Face } from "../src/text";
import { ROOT } from "./helpers";

test("the live config builds", () => {
  expect(Object.keys(build(ROOT, 1234))).toHaveLength(9);
});

test("every theme file loads", () => {
  // A holiday theme that is not active yet still gets checked.
  const names = readdirSync(join(ROOT, "themes")).filter((n) => n.endsWith(".toml")).map((n) => n.slice(0, -5));
  expect(names).toContain("default");
  for (const name of names) expect(Object.keys(loadTheme(ROOT, name)).sort()).toEqual([...SCHEMES].sort());
});

test("vendored fonts cover the banner's characters and are monospace where expected", () => {
  for (const name of ["BricolageGrotesque-800.ttf", "JetBrainsMono-400.ttf", "JetBrainsMono-800.ttf"]) {
    const face = new Face(join(ROOT, "fonts", name));
    for (const ch of "achiurizo_~/ since2008,contributions") expect(face.has(ch.codePointAt(0)!), `${name} ${ch}`).toBe(true);
  }
  const mono = new Face(join(ROOT, "fonts/JetBrainsMono-400.ttf"));
  const advances = new Set([..."il mW0,"].map((ch) => mono.font.glyphForCodePoint(ch.codePointAt(0)!).advanceWidth));
  expect(advances.size).toBe(1);
});
