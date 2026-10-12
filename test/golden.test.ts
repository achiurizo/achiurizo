// The TypeScript build must reproduce, byte for byte, what the original
// Python build committed for the same config and count.
import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "../src/build";

const ROOT = join(import.meta.dir, "..");
const GOLDEN = join(import.meta.dir, "golden");

test("build reproduces the committed banner byte for byte", () => {
  const files = build(GOLDEN, 2865, { fontsRoot: ROOT });
  const expected: Record<string, string> = { "README.md": readFileSync(join(GOLDEN, "README.md"), "utf8") };
  for (const name of readdirSync(join(GOLDEN, "assets"))) {
    expected[`assets/${name}`] = readFileSync(join(GOLDEN, "assets", name), "utf8");
  }
  expect(Object.keys(files).sort()).toEqual(Object.keys(expected).sort());
  for (const [path, content] of Object.entries(expected)) {
    expect(files[path] === content, `${path} differs`).toBe(true);
  }
});
