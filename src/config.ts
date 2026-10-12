// Load config.toml and the active theme, and reject anything malformed.
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const SCHEMES = ["dark", "light"] as const;
export type Scheme = (typeof SCHEMES)[number];
export const THEME_KEYS = [
  "window_bg", "window_border", "chrome", "wordmark", "cursor", "bar_bg",
  "seg1_bg", "seg1_fg", "seg2_bg", "seg2_fg", "seg3_bg", "seg3_fg",
] as const;
const HEX = /^#[0-9a-fA-F]{6}$/;
const THEME_NAME = /^[a-z0-9_-]+$/;
const SEGMENT_KEYS = ["text", "link", "title"];
const SEGMENT_NAMES = ["left", "middle", "right"];
const TOP_KEYS = ["theme", "segments"];
// C0 and C1 control characters, line breaks included. One of these would break the
// SVG or split the one-line README.
const CONTROL = /[\x00-\x1f\x7f-\x9f]/;

export class ConfigError extends Error {}

export interface Segment {
  text: string;
  link: string | null;
  title: string | null;
  suffix: string; // right segment only: text after the live stat
}

export type Theme = Record<Scheme, Record<string, string>>;

export interface Config {
  theme: Theme;
  left: Segment;
  middle: Segment;
  right: Segment;
}

type Table = Record<string, unknown>;

function isTable(value: unknown): value is Table {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readToml(path: string, label: string): Table {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new ConfigError(`${label} not found`);
  }
  try {
    return Bun.TOML.parse(text) as Table;
  } catch (error) {
    throw new ConfigError(`${label} is not valid TOML: ${(error as Error).message}`);
  }
}

function checkLink(link: string, name: string): void {
  if (!link.startsWith("https://")) {
    throw new ConfigError(`segments.${name}.link must start with https://`);
  }
  if (!/^https:\/\/[^\/\s?#]+/.test(link) || /\s/.test(link)) {
    throw new ConfigError(`segments.${name}.link is not a complete https URL`);
  }
}

function segment(raw: unknown, name: string, takesText: boolean): Segment {
  if (!isTable(raw)) throw new ConfigError(`segments.${name} must be a table`);
  const allowed = takesText ? SEGMENT_KEYS : [...SEGMENT_KEYS, "suffix"];
  const unknown = Object.keys(raw).filter((key) => !allowed.includes(key)).sort();
  if (unknown.length) throw new ConfigError(`segments.${name} has unknown key ${unknown[0]}`);
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string") throw new ConfigError(`segments.${name}.${key} must be a string`);
    if (CONTROL.test(value)) {
      throw new ConfigError(`segments.${name}.${key} holds a control character or a line break`);
    }
  }
  const text = (raw.text as string | undefined) ?? "";
  if (takesText && !text.trim()) throw new ConfigError(`segments.${name}.text is empty`);
  if (!takesText && text) throw new ConfigError(`segments.${name}.text is set by the live stat, remove it`);
  const link = (raw.link as string | undefined) ?? null;
  if (link !== null) checkLink(link, name);
  return { text, link, title: (raw.title as string | undefined) ?? null, suffix: (raw.suffix as string | undefined) ?? "" };
}

export function loadTheme(root: string, name: unknown): Theme {
  if (typeof name !== "string" || !THEME_NAME.test(name)) {
    throw new ConfigError(`theme name ${JSON.stringify(name)} may hold only a-z, 0-9, _ and -`);
  }
  const path = join(root, "themes", `${name}.toml`);
  if (!statSync(path, { throwIfNoEntry: false })?.isFile()) {
    throw new ConfigError(`theme file not found: themes/${name}.toml`);
  }
  const raw = readToml(path, `themes/${name}.toml`);
  const theme = {} as Theme;
  for (const scheme of SCHEMES) {
    const table = raw[scheme];
    if (!isTable(table)) throw new ConfigError(`themes/${name}.toml has no [${scheme}] table`);
    for (const key of THEME_KEYS) {
      if (!(key in table)) throw new ConfigError(`themes/${name}.toml [${scheme}] is missing ${key}`);
    }
    for (const [key, value] of Object.entries(table)) {
      if (!(THEME_KEYS as readonly string[]).includes(key)) {
        throw new ConfigError(`themes/${name}.toml [${scheme}] has unknown key ${key}`);
      }
      if (typeof value !== "string" || !HEX.test(value)) {
        throw new ConfigError(`themes/${name}.toml [${scheme}] ${key} must be #rrggbb`);
      }
    }
    theme[scheme] = { ...(table as Record<string, string>) };
  }
  return theme;
}

export function load(root: string): Config {
  const raw = readToml(join(root, "config.toml"), "config.toml");
  for (const key of Object.keys(raw)) {
    if (!TOP_KEYS.includes(key)) throw new ConfigError(`config.toml has unknown key ${key}`);
  }
  const segments = raw.segments ?? {};
  if (!isTable(segments)) throw new ConfigError("segments must be a table");
  for (const name of Object.keys(segments)) {
    if (!SEGMENT_NAMES.includes(name)) throw new ConfigError(`config.toml has unknown segment ${name}`);
  }
  return {
    theme: loadTheme(root, raw.theme ?? "default"),
    left: segment(segments.left ?? {}, "left", true),
    middle: segment(segments.middle ?? {}, "middle", true),
    right: segment(segments.right ?? {}, "right", false),
  };
}
