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
const TOP_KEYS = ["theme", "segments", "schedule"];
const RULE_KEYS = ["from", "to", "theme", "suffix"];
const EFFECT_KEYS = ["kind", "dark", "light"];
const MONTH_DAY = /^(\d{2})-(\d{2})$/;
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

// Decoration drawn inside the window body. "snow" is the only kind so far.
export interface Effect {
  kind: "snow";
  colors: Record<Scheme, string>;
}

export interface ThemeFile {
  colors: Theme;
  effect: Effect | null;
}

export interface Config {
  theme: Theme;
  effect: Effect | null;
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
  if (!/^https:\/\/[^\/\s?#]+/.test(link) || /\s/.test(link) || !URL.canParse(link)) {
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

function effect(raw: unknown, label: string): Effect | null {
  if (raw === undefined) return null;
  if (!isTable(raw)) throw new ConfigError(`${label} [effect] must be a table`);
  for (const key of Object.keys(raw)) {
    if (!EFFECT_KEYS.includes(key)) throw new ConfigError(`${label} [effect] has unknown key ${key}`);
  }
  if (raw.kind !== "snow") throw new ConfigError(`${label} [effect] kind must be snow`);
  const colors = {} as Record<Scheme, string>;
  for (const scheme of SCHEMES) {
    const value = raw[scheme];
    if (typeof value !== "string" || !HEX.test(value)) throw new ConfigError(`${label} [effect] ${scheme} must be #rrggbb`);
    colors[scheme] = value;
  }
  return { kind: "snow", colors };
}

export function loadTheme(root: string, name: unknown): ThemeFile {
  if (typeof name !== "string" || !THEME_NAME.test(name)) {
    throw new ConfigError(`theme name ${JSON.stringify(name)} may hold only a-z, 0-9, _ and -`);
  }
  const path = join(root, "themes", `${name}.toml`);
  if (!statSync(path, { throwIfNoEntry: false })?.isFile()) {
    throw new ConfigError(`theme file not found: themes/${name}.toml`);
  }
  const raw = readToml(path, `themes/${name}.toml`);
  for (const key of Object.keys(raw)) {
    if (key !== "effect" && !(SCHEMES as readonly string[]).includes(key)) {
      throw new ConfigError(`themes/${name}.toml has unknown table ${key}`);
    }
  }
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
  return { colors: theme, effect: effect(raw.effect, `themes/${name}.toml`) };
}

interface Rule {
  from: number; // month * 100 + day
  to: number;
  theme: ThemeFile;
  suffix: string | null;
}

function monthDay(value: unknown, label: string): number {
  const match = typeof value === "string" ? MONTH_DAY.exec(value) : null;
  const month = Number(match?.[1]);
  const day = Number(match?.[2]);
  // 2024 is a leap year, so 02-29 is accepted.
  if (!match || month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(2024, month, 0)).getUTCDate()) {
    throw new ConfigError(`${label} must be a date as MM-DD`);
  }
  return month * 100 + day;
}

// Every rule is checked on every build, so a broken holiday theme fails long
// before its first day.
function schedule(root: string, raw: unknown): Rule[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || !raw.every(isTable)) throw new ConfigError("schedule must be a list of tables");
  return raw.map((rule: Table, i) => {
    const label = `schedule rule ${i + 1}`;
    for (const key of Object.keys(rule)) {
      if (!RULE_KEYS.includes(key)) throw new ConfigError(`${label} has unknown key ${key}`);
    }
    const from = monthDay(rule.from, `${label}: from`);
    const to = monthDay(rule.to, `${label}: to`);
    if (rule.theme === undefined) throw new ConfigError(`${label}: theme is missing`);
    const suffix = rule.suffix ?? null;
    if (suffix !== null && typeof suffix !== "string") throw new ConfigError(`${label}: suffix must be a string`);
    if (suffix !== null && CONTROL.test(suffix)) throw new ConfigError(`${label}: suffix holds a control character or a line break`);
    return { from, to, theme: loadTheme(root, rule.theme), suffix };
  });
}

// The first rule whose range holds today's UTC date. A range may wrap over the
// new year (from 12-20 to 01-05).
function activeRule(rules: Rule[], today: Date): Rule | null {
  const date = (today.getUTCMonth() + 1) * 100 + today.getUTCDate();
  for (const rule of rules) {
    const inRange = rule.from <= rule.to ? date >= rule.from && date <= rule.to : date >= rule.from || date <= rule.to;
    if (inRange) return rule;
  }
  return null;
}

export function load(root: string, today: Date = new Date()): Config {
  const raw = readToml(join(root, "config.toml"), "config.toml");
  for (const key of Object.keys(raw)) {
    if (!TOP_KEYS.includes(key)) throw new ConfigError(`config.toml has unknown key ${key}`);
  }
  const segments = raw.segments ?? {};
  if (!isTable(segments)) throw new ConfigError("segments must be a table");
  for (const name of Object.keys(segments)) {
    if (!SEGMENT_NAMES.includes(name)) throw new ConfigError(`config.toml has unknown segment ${name}`);
  }
  const base = loadTheme(root, raw.theme ?? "default");
  const left = segment(segments.left ?? {}, "left", true);
  const middle = segment(segments.middle ?? {}, "middle", true);
  const right = segment(segments.right ?? {}, "right", false);
  const rule = activeRule(schedule(root, raw.schedule), today);
  const theme = rule?.theme ?? base;
  return {
    theme: theme.colors,
    effect: theme.effect,
    left,
    middle,
    right: rule?.suffix != null ? { ...right, suffix: rule.suffix } : right,
  };
}
