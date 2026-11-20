import dayjs, { type Dayjs } from "dayjs";
import { ZynError } from "./store.ts";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function today(): Dayjs {
  return dayjs().startOf("day");
}

export function currentMonth(): string {
  return today().format("YYYY-MM");
}

/** Accepts "2026-11", "11", "11/2026", "nov", "november 2026", "this", "last"/"prev". */
export function parseMonth(input: string | undefined, now: Dayjs = today()): string {
  const s = (input ?? "").trim().toLowerCase();
  if (!s || s === "this" || s === "current") return now.format("YYYY-MM");
  if (s === "last" || s === "prev" || s === "previous") return now.subtract(1, "month").format("YYYY-MM");

  let m = s.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return fmtMonth(+m[1], +m[2]);
  m = s.match(/^(\d{1,2})(?:[/-](\d{4}))?$/);
  if (m) return fmtMonth(m[2] ? +m[2] : now.year(), +m[1]);
  m = s.match(/^([a-z]+)\.?(?:\s+(\d{4}))?$/);
  if (m) {
    const idx = MONTHS.findIndex((name) => m![1].startsWith(name));
    if (idx >= 0) return fmtMonth(m[2] ? +m[2] : now.year(), idx + 1);
  }
  throw new ZynError(`Could not understand month "${input}". Try 2026-11, 11, or nov.`);
}

function fmtMonth(year: number, month: number): string {
  if (month < 1 || month > 12) throw new ZynError(`Invalid month number ${month}.`);
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * Accepts "", "today", "t", "yesterday", "y", "11/3", "11-3", "2026-11-03", "3" (day of this month),
 * or a weekday like "mon" (most recent, including today). Returns YYYY-MM-DD or null.
 */
export function parseDate(input: string | undefined, now: Dayjs = today()): string | null {
  const s = (input ?? "").trim().toLowerCase();
  if (!s || s === "today" || s === "t") return now.format("YYYY-MM-DD");
  if (s === "yesterday" || s === "y") return now.subtract(1, "day").format("YYYY-MM-DD");

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (m) {
    const year = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : now.year();
    return validDate(year, +m[1], +m[2]);
  }
  m = s.match(/^(\d{1,2})$/);
  if (m) return validDate(now.year(), now.month() + 1, +m[1]);

  const wd = WEEKDAYS.findIndex((d) => s.startsWith(d));
  if (wd >= 0 && /^[a-z]+$/.test(s)) {
    const back = (now.day() - wd + 7) % 7;
    return now.subtract(back, "day").format("YYYY-MM-DD");
  }
  return null;
}

function validDate(year: number, month: number, day: number): string | null {
  const d = dayjs(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  if (!d.isValid() || d.date() !== day || d.month() + 1 !== month) return null;
  return d.format("YYYY-MM-DD");
}

export function monthLabel(month: string): string {
  return dayjs(`${month}-01`).format("MMMM YYYY");
}

export function daysInMonth(month: string): number {
  return dayjs(`${month}-01`).daysInMonth();
}

export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return n + (["th", "st", "nd", "rd"][n % 10] ?? "th");
}

/** "November 1st, 2026" */
export function longDate(date: string): string {
  const d = dayjs(date);
  return `${d.format("MMMM")} ${ordinal(d.date())}, ${d.year()}`;
}

/** "Nov 3" */
export function shortDate(date: string): string {
  return dayjs(date).format("MMM D");
}
