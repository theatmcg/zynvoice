import { stripVTControlCharacters } from "node:util";
import chalk from "chalk";
import { formatHours } from "../lib/hours.ts";
import { money } from "../lib/money.ts";

export const c = {
  money: (n: number) => chalk.greenBright.bold(money(n)),
  moneySoft: (n: number) => chalk.green(money(n)),
  hours: (n: number) => chalk.cyanBright(formatHours(n)),
  label: (s: string) => chalk.gray(s),
  title: (s: string) => chalk.bold.hex("#9D8CFF")(s),
  accent: (s: string) => chalk.hex("#F50991")(s),
  dim: (s: string) => chalk.dim(s),
};

export function visibleWidth(s: string): number {
  return [...stripVTControlCharacters(s)].length;
}

export function padEnd(s: string, width: number): string {
  return s + " ".repeat(Math.max(0, width - visibleWidth(s)));
}

export function padStart(s: string, width: number): string {
  return " ".repeat(Math.max(0, width - visibleWidth(s))) + s;
}

export function truncate(s: string, width: number): string {
  const chars = [...s];
  return chars.length <= width ? s : chars.slice(0, Math.max(0, width - 1)).join("") + "…";
}

/** Rounded box around lines; `title` is embedded in the top border. */
export function box(lines: string[], opts: { title?: string; width?: number; color?: (s: string) => string } = {}): string {
  const color = opts.color ?? chalk.hex("#6C5CE7");
  const inner = Math.max(opts.width ?? 0, ...lines.map((l) => visibleWidth(l) + 4), opts.title ? visibleWidth(opts.title) + 6 : 0);
  const top = opts.title
    ? color("╭─ ") + opts.title + " " + color("─".repeat(inner - visibleWidth(opts.title) - 3) + "╮")
    : color("╭" + "─".repeat(inner) + "╮");
  const body = lines.map((l) => color("│") + "  " + padEnd(l, inner - 2) + color("│"));
  const bottom = color("╰" + "─".repeat(inner) + "╯");
  return [top, ...body, bottom].join("\n");
}

/** Horizontal bar using eighth-block characters for sub-cell precision. */
export function bar(value: number, max: number, width: number, color: (s: string) => string = chalk.hex("#7663FF")): string {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  const eighths = Math.round(ratio * width * 8);
  const full = Math.floor(eighths / 8);
  const part = eighths % 8;
  const partial = part ? "▏▎▍▌▋▊▉"[part - 1] : "";
  const used = full + (partial ? 1 : 0);
  return color("█".repeat(full) + partial) + chalk.gray("·".repeat(Math.max(0, width - used)));
}
