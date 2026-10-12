// Shape text and convert the glyphs to SVG path data.
//
// Letters become outlines. A character the font cannot draw (in practice an
// emoji) becomes a real <text> node in a fixed-width slot, drawn by the
// viewer's system emoji font.
import * as fontkit from "fontkit";

export const SLOT_EM = 1.2;
const EMOJI_FONTS = "Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif";
const ZWJ = 0x200d;
const VS16 = 0xfe0f; // asks for emoji presentation of the character before it
const KEYCAP = 0x20e3;

// Code points that extend the previous emoji: joiner, variation selector, keycap, skin tones, flag tags.
function isExtender(cp: number): boolean {
  return cp === ZWJ || cp === VS16 || cp === KEYCAP || (cp >= 0x1f3fb && cp < 0x1f400) || (cp >= 0xe0020 && cp < 0xe0080);
}

function isFlagLetter(cp: number): boolean {
  return cp >= 0x1f1e6 && cp <= 0x1f1ff;
}

export function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

// Two decimals, ties to even, no trailing zeros. Output stays byte-identical to
// the first build of this banner, which was written in Python.
export function num(v: number): string {
  let s = v.toFixed(2);
  const scaled = v * 100;
  if (Number.isInteger(v * 8) && Math.abs(scaled - Math.trunc(scaled)) === 0.5) {
    const low = Math.floor(scaled);
    s = ((low % 2 === 0 ? low : low + 1) / 100).toFixed(2);
  }
  s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s === "" || s === "-0" ? "0" : s;
}

export class Face {
  readonly font: any;
  constructor(path: string) {
    this.font = fontkit.openSync(path);
  }
  get upem(): number {
    return this.font.unitsPerEm;
  }
  has(cp: number): boolean {
    return this.font.hasGlyphForCodePoint(cp);
  }
}

export type Run = [slot: boolean, text: string];

export function splitRuns(face: Face, s: string): Run[] {
  const runs: { slot: boolean; cps: number[] }[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    const last = runs.at(-1);
    const inSlot = last?.slot ?? false;
    if (last && inSlot && (isExtender(cp) || last.cps.at(-1) === ZWJ)) {
      last.cps.push(cp);
    } else if (last && inSlot && isFlagLetter(cp) && last.cps.length === 1 && isFlagLetter(last.cps[0])) {
      last.cps.push(cp);
    } else if ((cp === VS16 || cp === KEYCAP) && last && last.cps.length) {
      // The character before it is one the font draws: move it into a slot of its own.
      const moved = last.cps.pop()!;
      if (!last.cps.length) runs.pop();
      runs.push({ slot: true, cps: [moved, cp] });
    } else if (isExtender(cp)) {
      continue;
    } else if (!face.has(cp)) {
      runs.push({ slot: true, cps: [cp] });
    } else if (last && !inSlot) {
      last.cps.push(cp);
    } else {
      runs.push({ slot: false, cps: [cp] });
    }
  }
  return runs.map((run) => [run.slot, String.fromCodePoint(...run.cps)]);
}

type Placed = [glyph: any, x: number, y: number];

function shape(face: Face, s: string, size: number, tracking: number): [Placed[], number] {
  // Ligatures off: "->" in bar copy stays two characters.
  const run = face.font.layout(s, { kern: true, liga: false, calt: false });
  const scale = size / face.upem;
  const placed: Placed[] = [];
  let x = 0;
  run.glyphs.forEach((glyph: any, i: number) => {
    const pos = run.positions[i];
    placed.push([glyph, x + pos.xOffset * scale, pos.yOffset * scale]);
    x += pos.xAdvance * scale + tracking;
  });
  return [placed, x];
}

export function measure(face: Face, s: string, size: number, tracking = 0): number {
  let width = 0;
  for (const [slot, run] of splitRuns(face, s)) {
    width += slot ? SLOT_EM * size : shape(face, run, size, tracking)[1];
  }
  return width;
}

// Writes path data the way fontTools' SVGPathPen does: H and V for straight
// lines, an implicit line after a move, no line back to the start before Z.
class PathPen {
  private parts: string[] = [];
  private lastX: number | null = null;
  private lastY: number | null = null;
  private lastCommand: string | null = null;

  private point(x: number, y: number): string {
    return `${num(x)} ${num(y)}`;
  }
  moveTo(x: number, y: number): void {
    this.parts.push("M" + this.point(x, y));
    this.lastCommand = "M";
    this.lastX = x;
    this.lastY = y;
  }
  lineTo(x: number, y: number): void {
    if (x === this.lastX && y === this.lastY) return;
    if (x === this.lastX) {
      this.parts.push("V" + num(y));
      this.lastCommand = "V";
    } else if (y === this.lastY) {
      this.parts.push("H" + num(x));
      this.lastCommand = "H";
    } else if (this.lastCommand === "M") {
      this.parts.push(" " + this.point(x, y));
    } else {
      this.parts.push("L" + this.point(x, y));
      this.lastCommand = "L";
    }
    this.lastX = x;
    this.lastY = y;
  }
  quadTo(x1: number, y1: number, x: number, y: number): void {
    this.parts.push("Q" + this.point(x1, y1) + " " + this.point(x, y));
    this.lastCommand = "Q";
    this.lastX = x;
    this.lastY = y;
  }
  close(): void {
    this.parts.push("Z");
    this.lastCommand = "Z";
    this.lastX = null;
    this.lastY = null;
  }
  data(): string {
    return this.parts.join("");
  }
}

type Point = [x: number, y: number];

function mid(a: Point, b: Point): Point {
  return [0.5 * (a[0] + b[0]), 0.5 * (a[1] + b[1])];
}

// A run of off-curve points ending in an on-curve point. Neighboring off-curve
// points imply an on-curve point halfway between them.
function quadRun(pen: PathPen, points: Point[]): void {
  const n = points.length - 1;
  for (let i = 0; i < n - 1; i++) {
    const implied = mid(points[i], points[i + 1]);
    pen.quadTo(points[i][0], points[i][1], implied[0], implied[1]);
  }
  pen.quadTo(points[n - 1][0], points[n - 1][1], points[n][0], points[n][1]);
}

// Walks the raw TrueType contour points in the same order as fontTools does,
// computing implied points after the transform. That keeps the committed banner
// byte-identical to the first (Python) build. Composite glyphs such as "j" and
// accented letters can differ from that build by 0.01 at some sizes.
// _getContours is a private fontkit API: fontkit is pinned to an exact version,
// and the golden test fails when its output shifts.
function drawGlyph(pen: PathPen, glyph: any, scale: number, dx: number, dy: number): void {
  for (const contour of glyph._getContours() as { onCurve: boolean; x: number; y: number }[][]) {
    let points = contour.map((p) => ({ on: p.onCurve, at: [scale * p.x + 0 * p.y + dx, 0 * p.x + -scale * p.y + dy] as Point }));
    const firstOn = points.findIndex((p) => p.on);
    if (firstOn === -1) {
      const start = mid(points.at(-1)!.at, points[0].at);
      pen.moveTo(start[0], start[1]);
      quadRun(pen, [...points.map((p) => p.at), start]);
    } else {
      // Rotate so the contour ends on an on-curve point, which is where it starts.
      points = [...points.slice(firstOn + 1), ...points.slice(0, firstOn + 1)];
      const start = points.at(-1)!.at;
      pen.moveTo(start[0], start[1]);
      let i = 0;
      while (i < points.length) {
        let j = i;
        while (!points[j].on) j++;
        if (j === i) {
          // The last line back to the start is implied by closing the path.
          if (points.length - i > 1) pen.lineTo(points[i].at[0], points[i].at[1]);
        } else {
          quadRun(pen, points.slice(i, j + 1).map((p) => p.at));
        }
        i = j + 1;
      }
    }
    pen.close();
  }
}

export function draw(face: Face, s: string, x: number, y: number, size: number, fill: string, tracking = 0, cls = ""): string {
  const scale = size / face.upem;
  const attr = cls ? ` class="${cls}"` : "";
  const parts: string[] = [];
  for (const [slot, run] of splitRuns(face, s)) {
    if (slot) {
      const width = SLOT_EM * size;
      parts.push(
        `<text x="${num(x + width / 2)}" y="${num(y)}" font-size="${num(size)}" ` +
          `text-anchor="middle" font-family="${EMOJI_FONTS}" fill="${fill}">${escape(run)}</text>`,
      );
      x += width;
      continue;
    }
    const [placed, width] = shape(face, run, size, tracking);
    const pen = new PathPen();
    for (const [glyph, gx, gy] of placed) drawGlyph(pen, glyph, scale, x + gx, y - gy);
    const d = pen.data();
    if (d) parts.push(`<path${attr} fill="${fill}" d="${d}"/>`);
    x += width;
  }
  return parts.join("");
}
