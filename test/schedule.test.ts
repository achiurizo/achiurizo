import { expect, test } from "bun:test";
import { appendFileSync, cpSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { main, build } from "../src/build";
import { ConfigError, load } from "../src/config";
import { cp, edit, tempRepo } from "./helpers";

const day = (iso: string) => new Date(`${iso}T12:00:00Z`);

// Fixture repo with a second theme and two dated rules.
function scheduled(extra = ""): string {
  const repo = tempRepo();
  cpSync(join(repo, "themes/default.toml"), join(repo, "themes/spooky.toml"));
  edit(join(repo, "themes/spooky.toml"), 'cursor = "#e058f5"', 'cursor = "#ff7518"');
  cpSync(join(repo, "themes/default.toml"), join(repo, "themes/frost.toml"));
  edit(join(repo, "themes/frost.toml"), 'cursor = "#e058f5"', 'cursor = "#d62839"');
  appendFileSync(
    join(repo, "config.toml"),
    '\n[[schedule]]\nfrom = "10-01"\nto = "10-31"\ntheme = "spooky"\nsuffix = " boo"\n' +
      '\n[[schedule]]\nfrom = "12-20"\nto = "01-05"\ntheme = "frost"\n' + extra,
  );
  return repo;
}

test("outside every rule the base theme applies", () => {
  const cfg = load(scheduled(), day("2026-09-30"));
  expect(cfg.theme.dark.cursor).toBe("#e058f5");
  expect(cfg.right.suffix).toBe("");
});

test("a rule applies on its first and last day", () => {
  const repo = scheduled();
  for (const iso of ["2026-10-01", "2026-10-15", "2026-10-31"]) {
    const cfg = load(repo, day(iso));
    expect(cfg.theme.dark.cursor).toBe("#ff7518");
    expect(cfg.right.suffix).toBe(" boo");
  }
  expect(load(repo, day("2026-11-01")).theme.dark.cursor).toBe("#e058f5");
});

test("a rule can wrap over the new year", () => {
  const repo = scheduled();
  for (const iso of ["2026-12-20", "2026-12-31", "2027-01-01", "2027-01-05"]) {
    expect(load(repo, day(iso)).theme.dark.cursor).toBe("#d62839");
  }
  expect(load(repo, day("2027-01-06")).theme.dark.cursor).toBe("#e058f5");
  expect(load(repo, day("2026-12-19")).theme.dark.cursor).toBe("#e058f5");
});

test("a rule without a suffix keeps the configured suffix", () => {
  const repo = scheduled();
  appendFileSync(join(repo, "config.toml"), '\n[segments.right]\nsuffix = " base"\n');
  expect(load(repo, day("2026-12-25")).right.suffix).toBe(" base");
  expect(load(repo, day("2026-10-10")).right.suffix).toBe(" boo");
});

test("the date is read in UTC", () => {
  const repo = scheduled();
  expect(load(repo, new Date("2026-10-31T23:59:59Z")).theme.dark.cursor).toBe("#ff7518");
  expect(load(repo, new Date("2026-11-01T00:00:00Z")).theme.dark.cursor).toBe("#e058f5");
});

test("a rule naming a missing theme fails even when the rule is not active", () => {
  const repo = scheduled('\n[[schedule]]\nfrom = "03-01"\nto = "03-02"\ntheme = "nope"\n');
  expect(() => load(repo, day("2026-07-01"))).toThrow(ConfigError);
  expect(() => load(repo, day("2026-07-01"))).toThrow("themes/nope.toml");
});

for (const [label, rule, message] of [
  ["a bad month", 'from = "13-01"\nto = "12-31"\ntheme = "spooky"', "schedule rule 3: from must be a date as MM-DD"],
  ["a bad day", 'from = "02-30"\nto = "03-01"\ntheme = "spooky"', "schedule rule 3: from must be a date as MM-DD"],
  ["a missing to", 'from = "02-01"\ntheme = "spooky"', "schedule rule 3: to must be a date as MM-DD"],
  ["a missing theme", 'from = "02-01"\nto = "02-02"', "schedule rule 3: theme is missing"],
  ["an unknown key", 'from = "02-01"\nto = "02-02"\ntheme = "spooky"\ncolor = "red"', "schedule rule 3 has unknown key color"],
  ["a control character in the suffix", 'from = "02-01"\nto = "02-02"\ntheme = "spooky"\nsuffix = "a\\nb"', "schedule rule 3: suffix holds a control character"],
] as const) {
  test(`a rule with ${label} fails`, () => {
    const repo = scheduled(`\n[[schedule]]\n${rule}\n`);
    expect(() => load(repo, day("2026-07-01"))).toThrow(message);
  });
}

test("schedule must be a list of tables", () => {
  const repo = tempRepo();
  writeFileSync(join(repo, "config.toml"), 'theme = "default"\nschedule = "soon"\n[segments.left]\ntext = "a"\n[segments.middle]\ntext = "b"\n');
  expect(() => load(repo, day("2026-07-01"))).toThrow("schedule must be a list of tables");
});

test("build and the --date flag follow the schedule", async () => {
  const repo = scheduled();
  const october = build(repo, 5, { today: day("2026-10-10") });
  const july = build(repo, 5, { today: day("2026-07-10") });
  expect(Object.keys(october).sort()).not.toEqual(Object.keys(july).sort());
  expect(await main(["--root", repo, "--count", "5", "--date", "2026-10-10"])).toBe(0);
  const { readdirSync } = await import("node:fs");
  expect(readdirSync(join(repo, "assets")).map((n) => `assets/${n}`).sort()).toEqual(Object.keys(october).filter((p) => p !== "README.md").sort());
});

test("an invalid --date fails", async () => {
  const { spyOn } = await import("bun:test");
  const spy = spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(await main(["--root", scheduled(), "--count", "5", "--date", "tomorrow"])).toBe(1);
    expect(String(spy.mock.calls[0][0])).toContain("--date must be YYYY-MM-DD");
  } finally {
    spy.mockRestore();
  }
});

test("an emoji suffix on a rule reaches the config", () => {
  const repo = scheduled('\n[[schedule]]\nfrom = "02-01"\nto = "02-02"\ntheme = "spooky"\nsuffix = " \\U0001F384"\n');
  expect(load(repo, day("2026-02-01")).right.suffix).toBe(" " + cp(0x1f384));
});
