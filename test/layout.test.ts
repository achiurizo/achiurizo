import { expect, test } from "bun:test";
import { ARROW, LayoutError, PAD, W, bar, widths } from "../src/layout";

const cells = (s: string, size: number) => s.length * 0.6 * size;
const LEFT = "since 2008";
const MIDDLE = "drifting thoughts of a model";

test("default copy fits at 18px", () => {
  const b = bar(cells, cells, LEFT, MIDDLE, "2,875 contributions");
  expect(b.size).toBe(18);
  expect(b.leftX).toBe(50);
  expect(b.seg1End).toBeCloseTo(174, 6);
  expect(b.middleX).toBeCloseTo(207, 6);
});

test("short copy uses 20px", () => {
  expect(bar(cells, cells, LEFT, "terminal automation", "2,875 contributions").size).toBe(20);
});

test("segments never overlap", () => {
  for (const right of ["999 contributions", "2,875 contributions", "123,456 contributions", "0 contributions", "1 contribution"]) {
    const b = bar(cells, cells, LEFT, MIDDLE, right);
    expect(b.seg1End + ARROW).toBeLessThan(b.cut1);
    expect(b.cut1).toBeLessThan(b.middleX);
    expect(b.seg2End + ARROW).toBeLessThan(b.cut2);
    expect(b.cut2).toBeLessThan(b.seg3Start - ARROW);
    expect(b.rightX + cells(right, b.size)).toBeCloseTo(W - PAD, 6);
  }
});

test("copy that is too long fails with the budget", () => {
  expect(() => bar(cells, cells, LEFT, "x".repeat(60), "2,875 contributions")).toThrow(LayoutError);
  expect(() => bar(cells, cells, LEFT, "x".repeat(60), "2,875 contributions")).toThrow(/middle text takes 60 character cells, the budget is \d+/);
});

test("the budget message counts cells, not code points", () => {
  // The measuring function, not the string length, decides how wide the copy is: an emoji slot is two cells.
  const wide = (s: string, size: number) => [...s].reduce((sum, ch) => sum + (ch === "x" ? 1.2 : 0.6), 0) * size;
  expect(() => bar(cells, wide, LEFT, "x".repeat(60), "2,875 contributions")).toThrow(/middle text takes 120 character cells/);
});

test("a long left text is named as the cause", () => {
  expect(() => bar(cells, cells, "x".repeat(70), "m", "2,875 contributions")).toThrow("left text and the stat leave no room");
});

test("widths sum to just under 100", () => {
  const w = widths(bar(cells, cells, LEFT, MIDDLE, "2,875 contributions"));
  const total = Object.values(w).reduce((sum, v) => sum + Number.parseFloat(v), 0);
  expect(total).toBeGreaterThan(99.9);
  expect(total).toBeLessThanOrEqual(100);
  expect(Object.keys(w)).toEqual(["left", "middle", "right"]);
  for (const v of Object.values(w)) expect(v.endsWith("%")).toBe(true);
});
