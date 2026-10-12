import { describe, expect, test } from "bun:test";
import { appendFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ConfigError, SCHEMES, THEME_KEYS, load } from "../src/config";
import { cp, edit, tempRepo } from "./helpers";

function fails(repo: string, message: string | RegExp): void {
  expect(() => load(repo)).toThrow(ConfigError);
  expect(() => load(repo)).toThrow(message);
}

test("loads the fixture config", () => {
  const cfg = load(tempRepo());
  expect(cfg.left.text).toBe("since 2008");
  expect(cfg.middle.text).toBe("drifting thoughts of a model");
  expect(cfg.middle.link).toBe("https://github.com/achiurizo/dreeft");
  expect(cfg.middle.title).toBe("dreeft");
  expect(cfg.right.text).toBe("");
  expect(cfg.right.link).toBeNull();
  for (const scheme of SCHEMES) expect(Object.keys(cfg.theme[scheme]).sort()).toEqual([...THEME_KEYS].sort());
});

test("a missing theme key fails", () => {
  const repo = tempRepo();
  edit(join(repo, "themes/default.toml"), 'cursor = "#e058f5"\n', "");
  fails(repo, "[dark] is missing cursor");
});

test("an unknown theme key fails", () => {
  const repo = tempRepo();
  edit(join(repo, "themes/default.toml"), "[light]", 'glow = "#ffffff"\n[light]');
  fails(repo, "[dark] has unknown key glow");
});

test("a color that is not #rrggbb fails", () => {
  const repo = tempRepo();
  edit(join(repo, "themes/default.toml"), '"#e058f5"', '"magenta"');
  fails(repo, "must be #rrggbb");
});

test("a missing theme file fails", () => {
  const repo = tempRepo();
  edit(join(repo, "config.toml"), 'theme = "default"', 'theme = "xmas"');
  fails(repo, "themes/xmas.toml");
});

test("a theme name cannot leave the themes directory", () => {
  const repo = tempRepo();
  edit(join(repo, "config.toml"), 'theme = "default"', 'theme = "../config"');
  fails(repo, "theme name");
});

test("a link that is not https is rejected", () => {
  const repo = tempRepo();
  edit(join(repo, "config.toml"), "https://github.com/achiurizo/dreeft", "javascript:alert(1)");
  fails(repo, "must start with https://");
});

test("empty segment text is rejected", () => {
  const repo = tempRepo();
  edit(join(repo, "config.toml"), '"drifting thoughts of a model"', '"  "');
  fails(repo, "segments.middle.text is empty");
});

test("a non-string segment value is rejected", () => {
  const repo = tempRepo();
  edit(join(repo, "config.toml"), 'title = "dreeft"', "title = 5");
  fails(repo, "segments.middle.title must be a string");
});

test("text on the right segment is rejected", () => {
  const repo = tempRepo();
  appendFileSync(join(repo, "config.toml"), '\n[segments.right]\ntext = "hello"\n');
  fails(repo, "segments.right.text");
});

describe("control characters are rejected", () => {
  const OLD = { text: '"drifting thoughts of a model"', title: '"dreeft"', link: '"https://github.com/achiurizo/dreeft"' };
  // TOML escapes for line feed, tab, U+0001 and U+0085.
  const BAD = ["\\n", "\\t", "\\u0001", "\\u0085"];
  for (const key of Object.keys(OLD) as (keyof typeof OLD)[]) {
    for (const bad of BAD) {
      test(`${key} with ${bad}`, () => {
        const repo = tempRepo();
        edit(join(repo, "config.toml"), OLD[key], OLD[key].slice(0, -1) + bad + '"');
        fails(repo, `segments.middle.${key} holds a control character`);
      });
    }
  }
});

for (const link of ["https://", "https://example.com/a b", "https:///path"]) {
  test(`incomplete link ${JSON.stringify(link)} is rejected`, () => {
    const repo = tempRepo();
    edit(join(repo, "config.toml"), "https://github.com/achiurizo/dreeft", link);
    fails(repo, "segments.middle.link is not a complete https URL");
  });
}

test("a missing config file is a config error", () => {
  const repo = tempRepo();
  rmSync(join(repo, "config.toml"));
  fails(repo, "config.toml not found");
});

test("invalid TOML is a config error", () => {
  const repo = tempRepo();
  writeFileSync(join(repo, "config.toml"), 'theme = "default\n');
  fails(repo, "config.toml is not valid TOML");
});

test("invalid theme TOML is a config error", () => {
  const repo = tempRepo();
  writeFileSync(join(repo, "themes/default.toml"), "[dark\n");
  fails(repo, "themes/default.toml is not valid TOML");
});

test("the theme name must be a string", () => {
  const repo = tempRepo();
  edit(join(repo, "config.toml"), 'theme = "default"', "theme = 5");
  fails(repo, "theme name");
});

test("segments must be tables", () => {
  const repo = tempRepo();
  writeFileSync(join(repo, "config.toml"), 'theme = "default"\nsegments = "x"\n');
  fails(repo, "segments must be a table");
  writeFileSync(join(repo, "config.toml"), 'theme = "default"\n[segments]\nleft = "x"\n');
  fails(repo, "segments.left must be a table");
});

test("an unknown top-level key fails", () => {
  const repo = tempRepo();
  edit(join(repo, "config.toml"), 'theme = "default"', 'them = "default"');
  fails(repo, "config.toml has unknown key them");
});

test("an unknown segment name fails", () => {
  const repo = tempRepo();
  appendFileSync(join(repo, "config.toml"), '\n[segments.center]\ntext = "x"\n');
  fails(repo, "unknown segment center");
});

test("the right segment takes a suffix", () => {
  const repo = tempRepo();
  appendFileSync(join(repo, "config.toml"), '\n[segments.right]\nsuffix = " !"\n');
  expect(load(repo).right.suffix).toBe(" !");
  expect(load(repo).middle.suffix).toBe("");
});

test("a suffix is only for the right segment", () => {
  const repo = tempRepo();
  edit(join(repo, "config.toml"), 'title = "dreeft"', 'suffix = "x"');
  fails(repo, "segments.middle has unknown key suffix");
});

test("an emoji suffix written as a TOML escape loads", () => {
  const repo = tempRepo();
  appendFileSync(join(repo, "config.toml"), '\n[segments.right]\nsuffix = " \\U0001F383"\n');
  expect(load(repo).right.suffix).toBe(" " + cp(0x1f383));
});

test("a link with a malformed host is rejected", () => {
  const repo = tempRepo();
  edit(join(repo, "config.toml"), "https://github.com/achiurizo/dreeft", "https://[abc");
  fails(repo, "segments.middle.link is not a complete https URL");
});

test("segments are checked left to right", () => {
  const repo = tempRepo();
  edit(join(repo, "config.toml"), '"since 2008"', '""');
  appendFileSync(join(repo, "config.toml"), '\n[segments.right]\ntext = "hello"\n');
  fails(repo, "segments.left.text is empty");
});
