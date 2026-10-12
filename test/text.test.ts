import { expect, test } from "bun:test";
import { join } from "node:path";
import { Face, SLOT_EM, draw, measure, num, splitRuns } from "../src/text";
import { ROOT, cp } from "./helpers";

const mono = new Face(join(ROOT, "fonts/JetBrainsMono-400.ttf"));
const display = new Face(join(ROOT, "fonts/BricolageGrotesque-800.ttf"));
const FLAME = cp(0x1f525);

test("num keeps two decimals and drops trailing zeros", () => {
  expect(num(1.0)).toBe("1");
  expect(num(-0.001)).toBe("0");
  expect(num(12.3456)).toBe("12.35");
  expect(num(26.6)).toBe("26.6");
});

test("num rounds exact ties to the even digit", () => {
  expect(num(0.125)).toBe("0.12");
  expect(num(0.375)).toBe("0.38");
  expect(num(2.625)).toBe("2.62");
  expect(num(-0.125)).toBe("-0.12");
});

test("monospace text measures in cells", () => {
  expect(measure(mono, "since 2008", 20)).toBeCloseTo(10 * 0.6 * 20, 6);
});

test("tracking adds once per glyph", () => {
  const plain = measure(display, "achiurizo", 120);
  expect(measure(display, "achiurizo", 120, -4)).toBeCloseTo(plain - 4 * 9, 6);
});

test("draw returns one path and no text node", () => {
  const out = draw(mono, "since 2008", 50, 234, 18, "#e6edf3");
  expect(out.startsWith('<path fill="#e6edf3" d="M')).toBe(true);
  expect(out.match(/<path/g)).toHaveLength(1);
  expect(out).not.toContain("<text");
});

test("draw adds the class attribute", () => {
  expect(draw(mono, "_", 0, 0, 18, "#fff", 0, "cur").startsWith('<path class="cur" fill="#fff"')).toBe(true);
});

test("draw is deterministic", () => {
  expect(draw(display, "achiurizo", 20, 158, 120, "#000", -4)).toBe(draw(display, "achiurizo", 20, 158, 120, "#000", -4));
});

test("coordinates carry two decimals at most", () => {
  expect(draw(display, "achiurizo", 20.123456, 158, 120, "#000")).not.toMatch(/\d\.\d{3}/);
});

test("plain text is one outlined run", () => {
  expect(splitRuns(mono, "abc def")).toEqual([[false, "abc def"]]);
});

test("an emoji gets its own slot", () => {
  expect(splitRuns(mono, `hi ${FLAME} there`)).toEqual([[false, "hi "], [true, FLAME], [false, " there"]]);
});

test("joined emoji sequences stay in one slot", () => {
  const family = cp(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);
  const thumbs = cp(0x1f44d, 0x1f3fd);
  const flameVs = cp(0x1f525, 0xfe0f);
  for (const cluster of [family, thumbs, flameVs]) {
    expect(splitRuns(mono, `a${cluster}b`)).toEqual([[false, "a"], [true, cluster], [false, "b"]]);
  }
});

test("flag pairs stay together", () => {
  const japan = cp(0x1f1ef, 0x1f1f5);
  const france = cp(0x1f1eb, 0x1f1f7);
  expect(splitRuns(mono, `a${japan}${france}b`)).toEqual([[false, "a"], [true, japan], [true, france], [false, "b"]]);
});

test("a keycap stays together", () => {
  const keycap = "1" + cp(0xfe0f, 0x20e3);
  expect(splitRuns(mono, `a${keycap}b`)).toEqual([[false, "a"], [true, keycap], [false, "b"]]);
});

test("a tag sequence stays together", () => {
  const england = cp(0x1f3f4, ...[..."gbeng"].map((c) => 0xe0000 + c.charCodeAt(0)), 0xe007f);
  expect(splitRuns(mono, england)).toEqual([[true, england]]);
});

test("a variation selector turns a letter into a slot", () => {
  // U+FE0F asks for emoji presentation, so the character before it leaves the outlined run.
  expect(splitRuns(mono, "ab" + cp(0xfe0f) + "c")).toEqual([[false, "a"], [true, "b" + cp(0xfe0f)], [false, "c"]]);
});

test("a slot counts as 1.2 em", () => {
  expect(measure(mono, "a" + FLAME, 20)).toBeCloseTo(0.6 * 20 + SLOT_EM * 20, 6);
});

test("a slot becomes a text node", () => {
  const out = draw(mono, "a" + FLAME, 0, 20, 20, "#fff");
  expect(out.match(/<text/g)).toHaveLength(1);
  expect(out).toContain(FLAME + "</text>");
});

test("markup characters are outlined and never reach the markup", () => {
  const out = draw(mono, 'a & <b> "c"', 0, 20, 20, "#fff");
  expect(out).not.toContain("<text");
  expect(out).not.toContain("&");
  expect(out.match(/</g)).toHaveLength(1);
});

test("slot text carries the fill", () => {
  // A character the font lacks that is not an emoji (CJK, say) is drawn by a system font in this color.
  const out = draw(mono, cp(0x65e5), 0, 20, 20, "#abcdef");
  expect(out.startsWith("<text ")).toBe(true);
  expect(out).toContain('fill="#abcdef"');
});

test("programming ligatures are off", () => {
  const d = (s: string) => [...s.matchAll(/ d="([^"]*)"/g)].map((m) => m[1]).join("");
  const plain = d(draw(mono, "-", 0, 20, 20, "#fff")) + d(draw(mono, ">", 12, 20, 20, "#fff"));
  expect(d(draw(mono, "->", 0, 20, 20, "#fff"))).toBe(plain);
});
