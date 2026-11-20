import * as p from "@clack/prompts";
import { parseDate } from "../lib/dates.ts";
import { parseTime, type ParsedTime } from "../lib/hours.ts";

export function unwrap<T>(value: T): Exclude<T, symbol> {
  if (p.isCancel(value)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }
  return value as Exclude<T, symbol>;
}

export async function askText(opts: {
  message: string;
  initialValue?: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  validate?: (v: string) => string | undefined;
}): Promise<string> {
  const value = unwrap(
    await p.text({
      message: opts.message,
      initialValue: opts.initialValue,
      placeholder: opts.placeholder,
      defaultValue: opts.defaultValue,
      validate: (v) => {
        const s = (v ?? "").trim();
        if (opts.required && !s && !opts.defaultValue) return "Required";
        return opts.validate?.(s);
      },
    }),
  );
  return (value ?? "").trim() || opts.defaultValue || "";
}

export async function askDate(message: string, initial?: string): Promise<string> {
  const input = await askText({
    message,
    initialValue: initial,
    placeholder: "today · yesterday · 11/3 · mon",
    defaultValue: "today",
    validate: (v) => (parseDate(v) ? undefined : "Try today, yesterday, 11/3, 2026-11-03, or mon"),
  });
  return parseDate(input)!;
}

export async function askTime(message: string, initial?: string): Promise<ParsedTime> {
  const input = await askText({
    message,
    initialValue: initial,
    placeholder: "10:30am-11:45am · 1.5 · 1h15m · 90m",
    required: true,
    validate: (v) => (parseTime(v) ? undefined : "Try 10:30am-11:45am, 1.5, 1h15m, or 90m"),
  });
  return parseTime(input)!;
}

const NEW_AREA = "\0new";

/** Picks an area from the list or creates a new one; returns the area and whether it is new. */
export async function askArea(areas: string[], initial?: string): Promise<{ area: string; isNew: boolean }> {
  if (areas.length) {
    const choice = unwrap(
      await p.select({
        message: "Area",
        initialValue: initial && areas.includes(initial) ? initial : areas[0],
        options: [...areas.map((a) => ({ value: a, label: a })), { value: NEW_AREA, label: "+ New area…" }],
      }),
    );
    if (choice !== NEW_AREA) return { area: choice, isNew: false };
  }
  const area = await askText({
    message: "New area name",
    placeholder: "spark-lms (Backend / Mobile Backend)",
    required: true,
  });
  return { area, isNew: !areas.includes(area) };
}

export async function askLines(message: string, initial: string[] = [], placeholder?: string): Promise<string[]> {
  const raw = await askText({
    message: `${message} (separate lines with "|")`,
    initialValue: initial.join(" | "),
    placeholder,
  });
  return raw
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}
