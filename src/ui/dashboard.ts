import chalk from "chalk";
import dayjs from "dayjs";
import { daysInMonth, monthLabel, shortDate, today } from "../lib/dates.ts";
import { formatHours, roundHours } from "../lib/hours.ts";
import { money, rateLabel } from "../lib/money.ts";
import { summarizePeriods, totalHours } from "../lib/periods.ts";
import type { Client, Display, Entry } from "../lib/schema.ts";
import { bigText } from "./bigtext.ts";
import { slotFrame } from "./slot.ts";
import { bar, box, c, padEnd, padStart, truncate } from "./theme.ts";

export interface DashboardInput {
  client: Client;
  month: string;
  entries: Entry[];
  prevMonthHours?: number;
  invoiceNote?: string;
  /** Monthly salary to add on top of invoice earnings. */
  salary?: number;
  display?: Display;
}

const WIDTH = 66;
const WIDTH_SALARY = 72;
const BAR = 24;

function heat(hours: number): (s: string) => string {
  if (hours >= 6) return chalk.bold.hex("#00FFD5");
  if (hours >= 3) return chalk.hex("#22D3EE");
  if (hours >= 1) return chalk.hex("#5FA8D3");
  return chalk.hex("#5C7A99");
}

function section(title: string): string {
  return `\n  ${chalk.bold.hex("#9D8CFF")(title)}`;
}

export function renderDashboard(input: DashboardInput): string {
  return renderHeader(input) + "\n" + renderBody(input);
}

/** The summary box. `t` < 1 renders a slot-machine frame of the count-up. */
export function renderHeader(input: DashboardInput, t = 1): string {
  const { client, month, entries, prevMonthHours, invoiceNote, salary } = input;
  const rate = client.rate;
  const hours = totalHours(entries);
  const earned = hours * rate;
  const total = earned + (salary ?? 0);
  const now = today();
  const isCurrent = now.format("YYYY-MM") === month;
  const days = new Set(entries.map((e) => e.date));
  const f = slotFrame(t);
  const rollMoney = (n: number) => f.roll(money(n), n);
  const rollHours = (n: number) => f.roll(formatHours(n), roundHours(n));

  const big = bigText(rollMoney(total).replace("$", ""), (s) => chalk.greenBright(s));
  const sep = c.dim(salary !== undefined ? "  │  " : "   │   ");
  const stats =
    salary !== undefined
      ? [
          `${c.label("INVOICE")} ${chalk.greenBright.bold(rollMoney(earned))}`,
          `${c.label("SALARY")} ${chalk.greenBright.bold(rollMoney(salary))}`,
          `${c.label("HOURS")} ${chalk.cyanBright(rollHours(hours))} ${c.dim("@")} ${chalk.white(rateLabel(rate))}`,
        ].join(sep)
      : [
          `${c.label("EARNED")} ${chalk.greenBright.bold(rollMoney(earned))}`,
          `${c.label("HOURS")} ${chalk.cyanBright(rollHours(hours))}`,
          `${c.label("RATE")} ${chalk.white(rateLabel(rate))}`,
        ].join(sep);

  const facts: string[] = [`${days.size} ${days.size === 1 ? "day" : "days"} worked`];
  if (days.size) facts.push(`${formatHours(hours / days.size)} avg/day`);
  if (isCurrent && hours > 0) {
    const projected = (hours / now.date()) * daysInMonth(month) * rate;
    facts.push(`on pace for ${c.moneySoft(projected)}${salary !== undefined ? ` + salary = ${c.moneySoft(projected + salary)}` : ""}`);
  }
  const lines = ["", ...big, "", stats, c.dim(facts.join(" · "))];
  if (prevMonthHours !== undefined && prevMonthHours > 0) {
    const prevLabel = dayjs(`${month}-01`).subtract(1, "month").format("MMMM");
    const diff = (hours - prevMonthHours) * rate;
    const arrow = diff >= 0 ? chalk.green(`▲ ${money(diff)}`) : chalk.red(`▼ ${money(-diff)}`);
    lines.push(c.dim(`${prevLabel}: ${formatHours(prevMonthHours)} · ${money(prevMonthHours * rate)}  `) + arrow);
  }
  if (invoiceNote) lines.push(chalk.hex("#F50991")(invoiceNote));
  lines.push("");
  const title = `${chalk.bold(client.name)} ${c.dim("·")} ${chalk.white(monthLabel(month))}${salary !== undefined ? c.dim(" · with salary") : ""}`;
  return box(lines, { title, width: salary !== undefined ? WIDTH_SALARY : WIDTH });
}

export function renderBody({ client, month, entries }: DashboardInput): string {
  const rate = client.rate;
  const hours = totalHours(entries);
  const now = today();
  const isCurrent = now.format("YYYY-MM") === month;
  const out: string[] = [];

  if (!entries.length) {
    out.push(c.dim(`  No hours logged yet. Add some with "zyn log".`));
    return out.join("\n") + "\n";
  }

  out.push(section("PERIODS"));
  const periods = summarizePeriods(month, entries, client.periodSplits, client.areas);
  const maxP = Math.max(...periods.map((p) => p.hours));
  for (const p of periods) {
    const active = isCurrent && now.date() >= p.startDay && now.date() <= p.endDay;
    const label = padEnd(active ? chalk.bold.white(p.label) : chalk.white(p.label), 11);
    out.push(
      `  ${label} ${bar(p.hours, maxP, BAR)}  ${padStart(c.hours(p.hours), 7)}  ${padStart(c.money(p.hours * rate), 11)}${active ? chalk.hex("#F50991")("  ◂ now") : ""}`,
    );
  }

  out.push(section("BY AREA"));
  const areaHours = new Map<string, number>();
  for (const e of entries) areaHours.set(e.area, (areaHours.get(e.area) ?? 0) + e.hours);
  const areas = [...areaHours.entries()].sort((a, b) => b[1] - a[1]);
  const maxA = Math.max(...areas.map(([, h]) => h));
  for (const [area, h] of areas) {
    const pct = Math.round((h / hours) * 100);
    out.push(`  ${padEnd(chalk.white(truncate(area, 36)), 36)}  ${padStart(c.dim(`${pct}%`), 4)}`);
    out.push(`  ${" ".repeat(11)} ${bar(h, maxA, BAR, chalk.hex("#22D3EE"))}  ${padStart(c.hours(roundHours(h)), 7)}  ${padStart(c.money(h * rate), 11)}`);
  }

  out.push(section("CALENDAR"));
  out.push(calendar(month, entries, rate, isCurrent ? now.date() : undefined));

  const last = [...entries].sort((a, b) => b.date.localeCompare(a.date))[0];
  out.push(c.dim(`\n  Last entry ${shortDate(last.date)}: ${truncate(last.task, 50)}`));
  return out.join("\n") + "\n";
}

function calendar(month: string, entries: Entry[], rate: number, todayDay?: number): string {
  const byDay = new Map<number, number>();
  for (const e of entries) byDay.set(+e.date.slice(8, 10), (byDay.get(+e.date.slice(8, 10)) ?? 0) + e.hours);
  const first = dayjs(`${month}-01`);
  const lead = (first.day() + 6) % 7;
  const total = daysInMonth(month);
  const CELL = 7;
  const rows: string[] = [];
  rows.push("  " + ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => padStart(c.dim(d), CELL)).join("") + c.dim("  │  week"));

  for (let weekStart = 1 - lead; weekStart <= total; weekStart += 7) {
    let dayRow = "  ";
    let hourRow = "  ";
    let weekHours = 0;
    for (let i = 0; i < 7; i++) {
      const d = weekStart + i;
      if (d < 1 || d > total) {
        dayRow += " ".repeat(CELL);
        hourRow += " ".repeat(CELL);
        continue;
      }
      const h = byDay.get(d) ?? 0;
      weekHours += h;
      const num = String(d);
      dayRow += padStart(d === todayDay ? chalk.bgHex("#F50991").white.bold(num) : c.dim(num), CELL);
      hourRow += padStart(h ? heat(h)(formatHours(h)) : chalk.gray("·"), CELL);
    }
    rows.push(dayRow + c.dim("  │"));
    rows.push(
      hourRow + c.dim("  │  ") + (weekHours ? `${padStart(c.hours(roundHours(weekHours)), 6)}  ${c.moneySoft(weekHours * rate)}` : c.dim("—")),
    );
  }
  return rows.join("\n");
}
