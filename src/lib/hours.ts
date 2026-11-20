export interface ParsedTime {
  hours: number;
  start?: string;
  end?: string;
}

interface ClockTime {
  minutes: number;
  meridiem?: "am" | "pm";
}

function parseClock(input: string): ClockTime | null {
  const m = input.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(a|am|p|pm)?$/);
  if (!m) return null;
  const hour = +m[1];
  const minute = m[2] ? +m[2] : 0;
  if (minute > 59) return null;
  const meridiem = m[3] ? (m[3].startsWith("a") ? "am" : "pm") : undefined;
  if (meridiem && (hour < 1 || hour > 12)) return null;
  if (!meridiem && hour > 23) return null;
  let h = hour;
  if (meridiem === "am" && hour === 12) h = 0;
  if (meridiem === "pm" && hour !== 12) h = hour + 12;
  return { minutes: h * 60 + minute, meridiem };
}

function formatClock(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, "0");
  const suffix = h24 < 12 ? "am" : "pm";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mm}${suffix}`;
}

export function roundHours(h: number): number {
  return Math.round(h * 100) / 100;
}

/**
 * Parses a time range ("10:30am-11:45am", "6:25pm-7:26", "9-11:30") or a duration
 * ("1.5", "1.5h", "1h15m", "90m", "1:30"). Returns null when the input isn't understood.
 */
export function parseTime(input: string | undefined): ParsedTime | null {
  const s = (input ?? "").trim().toLowerCase().replace(/\s+to\s+/, "-");
  if (!s) return null;

  const range = s.split(/\s*[-–]\s*/);
  if (range.length === 2 && range[0] && range[1]) {
    const a = parseClock(range[0]);
    const b = parseClock(range[1]);
    if (!a || !b) return null;
    let start = a.minutes;
    let end = b.minutes;
    // A bare start hour like "9-11:30pm" takes its meridiem from the end time, and vice versa.
    if (!a.meridiem && b.meridiem === "pm" && start < 720 && start + 720 <= end) start += 720;
    if (!b.meridiem && a.meridiem === "pm" && end < 720) end += 720;
    while (end <= start && end < start + 1440) end += 720;
    const hours = roundHours((end - start) / 60);
    if (hours <= 0 || hours > 24) return null;
    return { hours, start: formatClock(start), end: formatClock(end) };
  }

  let m = s.match(/^(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)?$/);
  if (m) return positive(+m[1]);
  m = s.match(/^(?:(\d+(?:\.\d+)?)\s*h(?:rs?|ours?)?)?\s*(?:(\d+)\s*m(?:in(?:s|utes?)?)?)?$/);
  if (m && (m[1] || m[2])) return positive((m[1] ? +m[1] : 0) + (m[2] ? +m[2] / 60 : 0));
  m = s.match(/^(\d+):(\d{2})$/);
  if (m && +m[2] < 60) return positive(+m[1] + +m[2] / 60);
  return null;
}

function positive(hours: number): ParsedTime | null {
  const h = roundHours(hours);
  return h > 0 && h <= 24 ? { hours: h } : null;
}

export function formatHours(h: number): string {
  return `${Number(roundHours(h).toFixed(2))}h`;
}
