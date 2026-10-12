import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const ROOT = join(import.meta.dir, "..");
export const FIX = join(import.meta.dir, "fixtures");

// A throwaway repo: fixture config and themes, real fonts.
export function tempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "header-"));
  cpSync(join(FIX, "config.toml"), join(dir, "config.toml"));
  cpSync(join(FIX, "themes"), join(dir, "themes"), { recursive: true });
  cpSync(join(ROOT, "fonts"), join(dir, "fonts"), { recursive: true });
  return dir;
}

export function edit(path: string, from: string, to: string): void {
  const text = readFileSync(path, "utf8");
  if (!text.includes(from)) throw new Error(`edit: ${JSON.stringify(from)} not in ${path}`);
  writeFileSync(path, text.replace(from, to));
}

export function cp(...codes: number[]): string {
  return String.fromCodePoint(...codes);
}
