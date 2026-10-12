import { expect, test } from "bun:test";
import { StatError, query, total } from "../src/stat";

const payload = (...counts: number[]) => ({
  data: { user: Object.fromEntries(counts.map((c, i) => [`y${2008 + i}`, { contributionCalendar: { totalContributions: c } }])) },
});

test("the query has one alias per year and never uses viewer", () => {
  const q = query("achiurizo", 2008, 2026);
  expect(q).toContain('user(login:"achiurizo")');
  expect(q).not.toContain("viewer");
  for (let year = 2008; year <= 2026; year++) {
    expect(q).toContain(`y${year}:contributionsCollection(from:"${year}-01-01T00:00:00Z",to:"${year}-12-31T23:59:59Z")`);
  }
  expect(q).not.toContain("y2027");
  expect(q).not.toContain("y2007");
});

test("total sums the years", () => {
  expect(total(payload(1, 27, 829))).toBe(857);
});

test("total rejects an error answer", () => {
  expect(() => total({ errors: [{ message: "rate limited" }], data: null })).toThrow(StatError);
  expect(() => total({ errors: [{ message: "rate limited" }], data: null })).toThrow("rate limited");
});

test("total rejects a null user", () => {
  expect(() => total({ data: { user: null } })).toThrow("no user");
});

test("total rejects a missing year", () => {
  expect(() => total({ data: { user: { y2008: { contributionCalendar: { totalContributions: 1 } }, y2009: null } } })).toThrow("y2009");
});

const BAD: unknown[] = [
  { errors: ["x"] },
  [1, 2],
  "nope",
  { data: { user: { y2008: { contributionCalendar: {} } } } },
  { data: { user: { y2008: { contributionCalendar: { totalContributions: "7" } } } } },
  { data: { user: "x" } },
];
BAD.forEach((bad, i) => {
  test(`total rejects unexpected shape ${i}`, () => {
    expect(() => total(bad)).toThrow(StatError);
  });
});

test("an HTTP error is reported as such, not as a missing user", async () => {
  const { spyOn } = await import("bun:test");
  const { fetchTotal } = await import("../src/stat");
  const spy = spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"message":"Bad credentials"}', { status: 401 }));
  try {
    await expect(fetchTotal("bad-token")).rejects.toThrow("HTTP 401");
  } finally {
    spy.mockRestore();
  }
});
