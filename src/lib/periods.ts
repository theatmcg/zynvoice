import dayjs from "dayjs";
import { daysInMonth } from "./dates.ts";
import { roundHours } from "./hours.ts";
import type { Entry } from "./schema.ts";

export interface Period {
  key: string;
  startDay: number;
  endDay: number;
  /** "Nov 1-10" */
  label: string;
}

export interface AreaGroup {
  area: string;
  tasks: string[];
}

export interface PeriodSummary extends Period {
  entries: Entry[];
  hours: number;
  groups: AreaGroup[];
}

export function buildPeriods(month: string, splits: number[]): Period[] {
  const last = daysInMonth(month);
  const ends = [...new Set(splits.filter((d) => d >= 1 && d < last))].sort((a, b) => a - b);
  ends.push(last);
  const mon = dayjs(`${month}-01`).format("MMM");
  let start = 1;
  return ends.map((end) => {
    const period = {
      key: `${start}-${end}`,
      startDay: start,
      endDay: end,
      label: start === end ? `${mon} ${start}` : `${mon} ${start}-${end}`,
    };
    start = end + 1;
    return period;
  });
}

/** Groups tasks by area, ordering areas by `areaOrder` first, and dropping duplicate task text. */
export function groupByArea(entries: Entry[], areaOrder: string[] = []): AreaGroup[] {
  const groups = new Map<string, { tasks: string[]; seen: Set<string> }>();
  for (const e of entries) {
    let g = groups.get(e.area);
    if (!g) groups.set(e.area, (g = { tasks: [], seen: new Set() }));
    const norm = e.task.trim().toLowerCase();
    if (norm && !g.seen.has(norm)) {
      g.seen.add(norm);
      g.tasks.push(e.task.trim());
    }
  }
  const rank = (area: string) => {
    const i = areaOrder.indexOf(area);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...groups.entries()]
    .map(([area, g], i) => ({ area, tasks: g.tasks, i }))
    .sort((a, b) => rank(a.area) - rank(b.area) || a.i - b.i)
    .map(({ area, tasks }) => ({ area, tasks }));
}

export function summarizePeriods(
  month: string,
  entries: Entry[],
  splits: number[],
  areaOrder: string[] = [],
): PeriodSummary[] {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  return buildPeriods(month, splits).map((p) => {
    const inPeriod = sorted.filter((e) => {
      const day = +e.date.slice(8, 10);
      return e.date.startsWith(month) && day >= p.startDay && day <= p.endDay;
    });
    return {
      ...p,
      entries: inPeriod,
      hours: roundHours(inPeriod.reduce((sum, e) => sum + e.hours, 0)),
      groups: groupByArea(inPeriod, areaOrder),
    };
  });
}

export function totalHours(entries: Entry[]): number {
  return roundHours(entries.reduce((sum, e) => sum + e.hours, 0));
}
