import { expect, test } from "bun:test";
import { SCHEMES, THEME_KEYS, load, type Config } from "../src/config";
import { W, ARROW } from "../src/layout";
import { loadFaces, render, slices, statText } from "../src/render";
import { FIX, ROOT, cp } from "./helpers";

const faces = loadFaces(ROOT);
const cfg = load(FIX);
// Every SVG here must be well-formed XML. Bun has no XML parser built in, so
// this checks what the build can get wrong: tag balance and stray markup.
function wellFormed(svg: string): void {
  const tags = [...svg.matchAll(/<(\/?)([a-zA-Z]+)[^>]*?(\/?)>/g)];
  const open: string[] = [];
  for (const [, close, name, selfClose] of tags) {
    if (selfClose) continue;
    if (close) expect(open.pop()).toBe(name);
    else open.push(name);
  }
  expect(open).toEqual([]);
  expect(svg.replace(/<[^>]*>/g, "")).not.toMatch(/[<>]/);
  expect(svg).not.toMatch(/&(?!amp;|lt;|gt;|quot;|#x27;)/);
}

test("stat text", () => {
  expect(statText(0)).toBe("0 contributions");
  expect(statText(1)).toBe("1 contribution");
  expect(statText(2875)).toBe("2,875 contributions");
  expect(statText(123456)).toBe("123,456 contributions");
});

for (const scheme of SCHEMES) {
  test(`${scheme} output is a valid outlined SVG`, () => {
    const [svg] = render(cfg, scheme, 2875, faces);
    wellFormed(svg);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 846 252" width="846" height="252">')).toBe(true);
    expect(svg).not.toContain("@font-face");
    expect(svg).not.toContain("<text");
    expect(svg).toContain("@media (prefers-reduced-motion:reduce){.cur{animation:none}}");
    expect(svg.match(/class="cur"/g)).toHaveLength(1);
  });
}

test("every theme key is consumed", () => {
  const sentinel = Object.fromEntries(THEME_KEYS.map((key, i) => [key, `#0000${(i + 1).toString(16).padStart(2, "0")}`]));
  const probe: Config = { ...cfg, theme: { dark: sentinel, light: sentinel } };
  const [svg] = render(probe, "dark", 2875, faces);
  for (const [key, color] of Object.entries(sentinel)) expect(svg.includes(color), key).toBe(true);
  for (const scheme of SCHEMES) for (const color of Object.values(cfg.theme[scheme])) expect(svg).not.toContain(color);
});

test("render is deterministic", () => {
  expect(render(cfg, "dark", 2875, faces)[0]).toBe(render(cfg, "dark", 2875, faces)[0]);
});

test("an emoji in the middle text renders one text node", () => {
  const probe: Config = { ...cfg, middle: { ...cfg.middle, text: `drifting ${cp(0x1f300)} thoughts` } };
  const [svg] = render(probe, "dark", 2875, faces);
  wellFormed(svg);
  expect(svg.match(/<text/g)).toHaveLength(1);
});

test("markup characters in segment text stay valid", () => {
  const probe: Config = { ...cfg, middle: { ...cfg.middle, text: 'a & <b> "c"' } };
  const [svg] = render(probe, "dark", 2875, faces);
  wellFormed(svg);
  expect(svg).not.toContain("<text");
});

for (const count of [0, 1, 999, 2875, 123456]) {
  test(`count ${count} lays out inside the bar`, () => {
    const [, b] = render(cfg, "dark", count, faces);
    expect(b.size).toBeGreaterThanOrEqual(16);
    expect(b.cut1).toBeLessThan(b.middleX);
    expect(b.seg2End + ARROW).toBeLessThan(b.cut2);
    expect(b.cut2).toBeLessThan(b.seg3Start - ARROW);
  });
}

test("slices change only the viewBox", () => {
  const [svg, b] = render(cfg, "dark", 2875, faces);
  const parts = slices(svg, b);
  expect(Object.keys(parts)).toEqual(["top", "left", "middle", "right"]);
  const headOf = (x: number, w: number, y: number, h: number) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}">`;
  expect(parts.top.startsWith(headOf(0, 846, 0, 204))).toBe(true);
  expect(parts.left.startsWith(headOf(0, b.cut1, 204, 48))).toBe(true);
  expect(parts.middle.startsWith(headOf(b.cut1, b.cut2 - b.cut1, 204, 48))).toBe(true);
  expect(parts.right.startsWith(headOf(b.cut2, W - b.cut2, 204, 48))).toBe(true);
  const body = svg.slice(svg.indexOf(">") + 1);
  for (const part of Object.values(parts)) {
    expect(part.slice(part.indexOf(">") + 1)).toBe(body);
    wellFormed(part);
  }
});

test("the right suffix follows the count", () => {
  const pumpkin = cp(0x1f383);
  const probe: Config = { ...cfg, right: { ...cfg.right, suffix: " " + pumpkin } };
  const [svg, withSuffix] = render(probe, "dark", 2875, faces);
  const [, plain] = render(cfg, "dark", 2875, faces);
  wellFormed(svg);
  expect(svg.match(/<text/g)).toHaveLength(1);
  expect(svg).toContain(`fill="${cfg.theme.dark.seg3_fg}">${pumpkin}</text>`);
  expect(withSuffix.rightX).toBeLessThan(plain.rightX);
});
