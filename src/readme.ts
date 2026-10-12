// Write the one-line README that lays the four banner slices edge to edge.
import type { Config, Scheme, Segment } from "./config";
import { escape } from "./text";

export type Paths = Record<"top" | "left" | "middle" | "right", Record<Scheme, string>>;

function picture(paths: Record<Scheme, string>, alt: string, width: string): string {
  return (
    `<picture><source media="(prefers-color-scheme: dark)" srcset="${escape(paths.dark)}">` +
    `<img src="${escape(paths.light)}" alt="${escape(alt)}" width="${width}" align="top"></picture>`
  );
}

function linked(pic: string, segment: Segment): string {
  if (!segment.link) return pic;
  const title = segment.title ? ` title="${escape(segment.title)}"` : "";
  return `<a href="${escape(segment.link)}"${title}>${pic}</a>`;
}

export function readme(cfg: Config, pct: Record<"left" | "middle" | "right", string>, paths: Paths): string {
  // No whitespace between tags: a space or newline would show as a gap between images.
  return (
    picture(paths.top, "achiurizo", "100%") +
    linked(picture(paths.left, `On GitHub ${cfg.left.text}`, pct.left), cfg.left) +
    linked(picture(paths.middle, cfg.middle.text, pct.middle), cfg.middle) +
    linked(picture(paths.right, "Contributions, all time", pct.right), cfg.right) +
    "\n"
  );
}
