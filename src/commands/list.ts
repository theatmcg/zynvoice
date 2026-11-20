import chalk from "chalk";
import Table from "cli-table3";
import dayjs from "dayjs";
import { monthLabel, parseMonth } from "../lib/dates.ts";
import { formatHours } from "../lib/hours.ts";
import { money } from "../lib/money.ts";
import { totalHours } from "../lib/periods.ts";
import { loadMonth } from "../lib/store.ts";
import { c } from "../ui/theme.ts";
import { getCtx } from "./context.ts";

export function listCommand(monthArg: string | undefined, opts: { client?: string }): void {
  const ctx = getCtx(opts.client);
  const month = parseMonth(monthArg);
  const { entries } = loadMonth(ctx.key, month);
  const rate = ctx.client.rate;

  console.log(`\n  ${chalk.bold(ctx.client.name)} · ${monthLabel(month)}\n`);
  if (!entries.length) {
    console.log(c.dim("  No entries.\n"));
    return;
  }

  const areaWidth = Math.min(38, Math.max(8, ...entries.map((e) => e.area.length)) + 2);
  const taskWidth = Math.max(30, Math.min(70, (process.stdout.columns ?? 120) - 56 - areaWidth));
  const table = new Table({
    head: ["Date", "Time", "Hours", "Amount", "Area", "Task"].map((h) => chalk.hex("#9D8CFF")(h)),
    colWidths: [10, 17, 8, 11, areaWidth, taskWidth],
    wordWrap: true,
    chars: { mid: "", "left-mid": "", "mid-mid": "", "right-mid": "" },
    style: { head: [], border: ["gray"] },
  });
  let lastDate = "";
  for (const e of entries) {
    table.push([
      e.date === lastDate ? "" : dayjs(e.date).format("ddd D"),
      e.start && e.end ? `${e.start}-${e.end}` : c.dim("—"),
      chalk.cyanBright(formatHours(e.hours)),
      chalk.green(money(e.hours * rate)),
      e.area,
      e.task,
    ]);
    lastDate = e.date;
  }
  const hours = totalHours(entries);
  table.push([chalk.bold("Total"), "", c.hours(hours), c.money(hours * rate), "", c.dim(`${entries.length} entries`)]);
  console.log(table.toString() + "\n");
}
