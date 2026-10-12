// Place the three powerline segments and choose the bar text size.
export const W = 846;
export const H = 252;
export const BAR_Y = 204;
export const BAR_H = 48;
export const PAD = 16;
export const ARROW = 19;
export const ICON = 24;
export const ICON_GAP = 10;
const TEXT_INSET = 14; // space between the left segment's arrow tip and the middle text
const MIN_GAP = 24; // bar background kept visible between the middle and right arrows
const SIZES = [20, 19, 18, 17, 16];

export class LayoutError extends Error {}

export interface Bar {
  size: number;
  baseline: number;
  leftX: number;
  seg1End: number;
  middleX: number;
  seg2End: number;
  rightX: number;
  seg3Start: number;
  cut1: number;
  cut2: number;
}

export type Measure = (s: string, size: number) => number;

// Round half to even, as the first build did.
function roundHalfEven(v: number): number {
  const low = Math.floor(v);
  if (v - low === 0.5) return low % 2 === 0 ? low : low + 1;
  return Math.round(v);
}

export function bar(regular: Measure, bold: Measure, left: string, middle: string, right: string): Bar {
  let size = SIZES[0];
  let slack = 0;
  for (size of SIZES) {
    const leftX = PAD + ICON + ICON_GAP;
    const seg1End = leftX + regular(left, size) + PAD;
    const middleX = seg1End + ARROW + TEXT_INSET;
    const seg2End = middleX + bold(middle, size) + PAD;
    const rightX = W - PAD - regular(right, size);
    const seg3Start = rightX - PAD;
    slack = seg3Start - ARROW - (seg2End + ARROW + MIN_GAP);
    if (slack >= 0) {
      return {
        size,
        baseline: BAR_Y + BAR_H / 2 + size / 3,
        leftX, seg1End, middleX, seg2End, rightX, seg3Start,
        cut1: Math.ceil(seg1End + ARROW) + 4,
        cut2: roundHalfEven((seg2End + ARROW + seg3Start - ARROW) / 2),
      };
    }
  }
  const cell = bold("m", size);
  const room = bold(middle, size) + slack;
  const budget = Math.floor(room / cell);
  // The small tolerance keeps float noise from adding a cell.
  const used = Math.ceil(bold(middle, size) / cell - 1e-9);
  if (budget < 1) {
    throw new LayoutError(`status bar copy does not fit at ${size}px: the left text and the stat leave no room for the middle text`);
  }
  throw new LayoutError(
    `status bar copy does not fit at ${size}px: middle text takes ${used} character cells, the budget is ${budget} (an emoji takes two)`,
  );
}

function pct(px: number): string {
  return `${Math.floor((px / W) * 10000) / 100}%`;
}

export function widths(b: Bar): Record<"left" | "middle" | "right", string> {
  return { left: pct(b.cut1), middle: pct(b.cut2 - b.cut1), right: pct(W - b.cut2) };
}
