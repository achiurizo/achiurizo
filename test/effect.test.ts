import { expect, test } from "bun:test";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { load, loadTheme } from "../src/config";
import { loadFaces, render } from "../src/render";
import { ROOT, tempRepo } from "./helpers";

const faces = loadFaces(ROOT);
const SNOW = '\n[effect]\nkind = "snow"\ndark = "#ffffff"\nlight = "#7fb4d6"\n';

function snowy(effect = SNOW): string {
  const repo = tempRepo();
  // [effect] is a top-level table, so it goes after the last color table.
  appendFileSync(join(repo, "themes/default.toml"), effect);
  return repo;
}

test("a theme without an effect table has none", () => {
  expect(load(tempRepo()).effect).toBeNull();
});

test("a snow effect loads with one color per scheme", () => {
  expect(load(snowy()).effect).toEqual({ kind: "snow", colors: { dark: "#ffffff", light: "#7fb4d6" } });
});

for (const [label, effect, message] of [
  ["an unknown kind", '\n[effect]\nkind = "rain"\ndark = "#ffffff"\nlight = "#ffffff"\n', "[effect] kind must be snow"],
  ["a missing color", '\n[effect]\nkind = "snow"\ndark = "#ffffff"\n', "[effect] light must be #rrggbb"],
  ["a bad color", '\n[effect]\nkind = "snow"\ndark = "white"\nlight = "#ffffff"\n', "[effect] dark must be #rrggbb"],
  ["an unknown key", '\n[effect]\nkind = "snow"\ndark = "#ffffff"\nlight = "#ffffff"\nspeed = "fast"\n', "[effect] has unknown key speed"],
] as const) {
  test(`an effect with ${label} fails`, () => {
    expect(() => load(snowy(effect))).toThrow(message);
  });
}

test("an unknown top-level table in a theme fails", () => {
  expect(() => load(snowy('\n[sparkle]\nkind = "x"\n'))).toThrow("has unknown table sparkle");
});

test("snow draws 28 flakes in the scheme color, clipped to the window body", () => {
  const cfg = load(snowy());
  const [dark] = render(cfg, "dark", 2875, faces);
  const [light] = render(cfg, "light", 2875, faces);
  const group = /<g class="snow" clip-path="url\(#sky\)">(.*?)<\/g><circle cx="22"/.exec(dark);
  expect(group).not.toBeNull();
  expect(group![1].match(/<circle /g)).toHaveLength(28);
  expect(group![1].match(/fill="#ffffff"/g)).toHaveLength(28);
  expect(light.match(/fill="#7fb4d6"/g)).toHaveLength(28);
  expect(dark).toContain('<clipPath id="sky"><rect x="1" y="37" width="844" height="167"/></clipPath>');
  expect(dark).toContain("@keyframes fall{");
  expect(dark).toContain("@keyframes sway{");
});

test("flakes sit behind the wordmark and above the status bar", () => {
  const [svg] = render(load(snowy()), "dark", 2875, faces);
  const snow = svg.indexOf('class="snow"');
  expect(snow).toBeGreaterThan(svg.indexOf('y="36"'));
  expect(snow).toBeLessThan(svg.indexOf('class="cur"'));
  expect(snow).toBeLessThan(svg.indexOf('clip-path="url(#win)"'));
});

test("reduced motion hides the snow and keeps the cursor rule", () => {
  const [svg] = render(load(snowy()), "dark", 2875, faces);
  expect(svg).toContain("@media (prefers-reduced-motion:reduce){.cur{animation:none}.snow{display:none}}");
});

test("snow is deterministic and only its color differs between schemes", () => {
  const cfg = load(snowy());
  expect(render(cfg, "dark", 2875, faces)[0]).toBe(render(cfg, "dark", 2875, faces)[0]);
  const flakes = (svg: string) => /<g class="snow"[^>]*>(.*?)<\/g><circle cx="22"/.exec(svg)![1];
  expect(flakes(render(cfg, "light", 2875, faces)[0]).replaceAll("#7fb4d6", "#ffffff")).toBe(flakes(render(cfg, "dark", 2875, faces)[0]));
});

test("a theme without an effect draws no snow", () => {
  const [svg] = render(load(tempRepo()), "dark", 2875, faces);
  expect(svg).not.toContain("snow");
  expect(svg).not.toContain("@keyframes fall");
  expect(svg).toContain("@media (prefers-reduced-motion:reduce){.cur{animation:none}}");
});

test("loadTheme returns colors and effect", () => {
  const theme = loadTheme(snowy(), "default");
  expect(Object.keys(theme).sort()).toEqual(["colors", "effect"]);
  expect(theme.effect?.kind).toBe("snow");
});
