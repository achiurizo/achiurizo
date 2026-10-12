// Draw the full banner for one color scheme and cut it into four slices.
import { join } from "node:path";
import type { Config, Scheme } from "./config";
import { ARROW, BAR_H, BAR_Y, H, ICON, PAD, W, bar, type Bar } from "./layout";
import { Face, draw, measure, num } from "./text";

const NAME = "achiurizo";
const TITLE = "~/achiurizo";
const TITLE_H = 36;
// GitHub mark, Octicons mark-github-16 (MIT).
const OCTO = "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z";
const STYLE =
  "<style>.cur{animation:blink 1.2s steps(1,end) infinite}" +
  "@keyframes blink{0%,55%{opacity:1}56%,100%{opacity:0}}" +
  "@media (prefers-reduced-motion:reduce){.cur{animation:none}}</style>";

function head(x: number, y: number, w: number, h: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}">`;
}

const FULL_HEAD = head(0, 0, W, H);

export interface Faces {
  display: Face;
  mono: Face;
  monoBold: Face;
}

export function loadFaces(root: string): Faces {
  const fonts = join(root, "fonts");
  return {
    display: new Face(join(fonts, "BricolageGrotesque-800.ttf")),
    mono: new Face(join(fonts, "JetBrainsMono-400.ttf")),
    monoBold: new Face(join(fonts, "JetBrainsMono-800.ttf")),
  };
}

export function statText(count: number): string {
  return count === 1 ? "1 contribution" : `${count.toLocaleString("en-US")} contributions`;
}

// Triangle whose flat side sits at x. direction 1 points right, -1 points left.
function arrow(x: number, direction: 1 | -1, fill: string): string {
  const base = x - direction; // overlap the segment by 1px so no hairline shows
  const tip = x + direction * ARROW;
  const mid = BAR_Y + BAR_H / 2;
  return `<polygon points="${num(base)},${BAR_Y} ${num(tip)},${num(mid)} ${num(base)},${BAR_Y + BAR_H}" fill="${fill}"/>`;
}

export function render(cfg: Config, scheme: Scheme, count: number, faces: Faces): [svg: string, bar: Bar] {
  const t = cfg.theme[scheme];
  const right = statText(count) + cfg.right.suffix;
  const b = bar(
    (s, size) => measure(faces.mono, s, size),
    (s, size) => measure(faces.monoBold, s, size),
    cfg.left.text, cfg.middle.text, right,
  );
  const nameW = measure(faces.display, NAME, 120, -4);
  const titleX = W / 2 - measure(faces.mono, TITLE, 15) / 2;
  const iconY = BAR_Y + (BAR_H - ICON) / 2;
  const parts = [
    FULL_HEAD,
    "<defs>", STYLE, `<clipPath id="win"><rect width="${W}" height="${H}" rx="10"/></clipPath>`, "</defs>",
    `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="10" fill="${t.window_bg}"/>`,
    `<rect x="1" y="${TITLE_H}" width="${W - 2}" height="1" fill="${t.window_border}"/>`,
    ...[22, 42, 62].map((cx) => `<circle cx="${cx}" cy="18" r="5.5" fill="none" stroke="${t.chrome}"/>`),
    draw(faces.mono, TITLE, titleX, 23, 15, t.chrome),
    draw(faces.display, NAME, 20, 158, 120, t.wordmark, -4),
    draw(faces.display, "_", 20 + nameW, 158, 120, t.cursor, 0, "cur"),
    '<g clip-path="url(#win)">',
    `<rect x="0" y="${BAR_Y}" width="${W}" height="${BAR_H}" fill="${t.bar_bg}"/>`,
    `<rect x="${num(b.seg1End)}" y="${BAR_Y}" width="${num(b.seg2End - b.seg1End)}" height="${BAR_H}" fill="${t.seg2_bg}"/>`,
    arrow(b.seg2End, 1, t.seg2_bg),
    `<rect x="0" y="${BAR_Y}" width="${num(b.seg1End)}" height="${BAR_H}" fill="${t.seg1_bg}"/>`,
    arrow(b.seg1End, 1, t.seg1_bg),
    `<rect x="${num(b.seg3Start)}" y="${BAR_Y}" width="${num(W - b.seg3Start)}" height="${BAR_H}" fill="${t.seg3_bg}"/>`,
    arrow(b.seg3Start, -1, t.seg3_bg),
    "</g>",
    `<path transform="translate(${PAD},${num(iconY)}) scale(${num(ICON / 16)})" fill="${t.seg1_fg}" d="${OCTO}"/>`,
    draw(faces.mono, cfg.left.text, b.leftX, b.baseline, b.size, t.seg1_fg),
    draw(faces.monoBold, cfg.middle.text, b.middleX, b.baseline, b.size, t.seg2_fg),
    draw(faces.mono, right, b.rightX, b.baseline, b.size, t.seg3_fg),
    `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="10" fill="none" stroke="${t.window_border}"/>`,
    "</svg>\n",
  ];
  return [parts.join(""), b];
}

export function slices(svg: string, b: Bar): Record<"top" | "left" | "middle" | "right", string> {
  if (!svg.startsWith(FULL_HEAD)) throw new Error("slices() needs the full banner from render()");
  const body = svg.slice(FULL_HEAD.length);
  return {
    top: head(0, 0, W, BAR_Y) + body,
    left: head(0, BAR_Y, b.cut1, BAR_H) + body,
    middle: head(b.cut1, BAR_Y, b.cut2 - b.cut1, BAR_H) + body,
    right: head(b.cut2, BAR_Y, W - b.cut2, BAR_H) + body,
  };
}
