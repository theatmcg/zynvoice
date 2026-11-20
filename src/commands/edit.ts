import fs from "node:fs";
import { spawnSync } from "node:child_process";
import * as p from "@clack/prompts";
import chalk from "chalk";
import dayjs from "dayjs";
import { currentMonth, monthLabel, parseMonth } from "../lib/dates.ts";
import { formatHours } from "../lib/hours.ts";
import { money } from "../lib/money.ts";
import { buildPeriods, totalHours } from "../lib/periods.ts";
import { addEntry, deleteEntry, loadMonth, paths, saveMonth, updateEntry } from "../lib/store.ts";
import type { Entry } from "../lib/schema.ts";
import { askArea, askDate, askText, askTime, unwrap } from "../ui/prompts.ts";
import { c, padEnd, truncate } from "../ui/theme.ts";
import { describeEntry } from "./log.ts";
import { getCtx, rememberArea, type Ctx } from "./context.ts";

const ADD = "\0add";
const TITLES = "\0titles";
const DONE = "\0done";

export async function editCommand(monthArg: string | undefined, opts: { client?: string; raw?: boolean }): Promise<void> {
  const ctx = getCtx(opts.client);
  const month = parseMonth(monthArg);
  if (opts.raw) return editRaw(ctx, month);

  p.intro(`${chalk.bold("Edit")} · ${ctx.client.name} · ${monthLabel(month)}`);
  while (true) {
    const log = loadMonth(ctx.key, month);
    const hours = totalHours(log.entries);
    const taskWidth = Math.max(20, (process.stdout.columns ?? 100) - 50);
    const choice = unwrap(
      await p.select<string>({
        message: `${log.entries.length} entries · ${c.hours(hours)} · ${c.money(hours * ctx.client.rate)}  ${c.dim("pick an entry to edit or delete")}`,
        maxItems: 14,
        options: [
          ...log.entries.map((e) => ({
            value: e.id,
            label: `${padEnd(dayjs(e.date).format("ddd MMM D"), 11)} ${padEnd(formatHours(e.hours), 6)} ${truncate(e.task, taskWidth)}`,
            hint: e.area,
          })),
          { value: ADD, label: chalk.green("+ Add entry") },
          { value: TITLES, label: chalk.hex("#9D8CFF")("✎ Period titles") },
          { value: DONE, label: "Done" },
        ],
      }),
    );

    if (choice === DONE) break;
    if (choice === ADD) await addFlow(ctx, month);
    else if (choice === TITLES) await editTitles(ctx, month);
    else await entryFlow(ctx, month, log.entries.find((e) => e.id === choice)!);
  }
  const hours = totalHours(loadMonth(ctx.key, month).entries);
  p.outro(`${monthLabel(month)}: ${c.hours(hours)} · ${c.money(hours * ctx.client.rate)}`);
}

async function entryFlow(ctx: Ctx, month: string, entry: Entry): Promise<void> {
  p.log.message(describeEntry(ctx, entry));
  const action = unwrap(
    await p.select({
      message: "What do you want to do?",
      options: [
        { value: "edit", label: "Edit" },
        { value: "dup", label: "Duplicate" },
        { value: "delete", label: chalk.red("Delete") },
        { value: "back", label: "Back" },
      ],
    }),
  );

  if (action === "edit") {
    const date = await askDate("Date", dayjs(entry.date).format("M/D/YYYY"));
    const time = await askTime("Time range or hours", entry.start && entry.end ? `${entry.start}-${entry.end}` : String(entry.hours));
    const { area } = await askArea(ctx.client.areas, entry.area);
    rememberArea(ctx, area);
    const task = await askText({ message: "What did you do?", initialValue: entry.task, required: true });
    const updated: Entry = { id: entry.id, date, hours: time.hours, start: time.start, end: time.end, area, task };
    updateEntry(ctx.key, month, updated);
    p.log.success(`Updated  ${describeEntry(ctx, updated)}`);
    if (!date.startsWith(month)) p.log.info(`Moved to ${monthLabel(date.slice(0, 7))}.`);
  } else if (action === "dup") {
    const date = await askDate("Date for the copy", dayjs(entry.date).format("M/D/YYYY"));
    const { id: _id, ...copy } = entry;
    const saved = addEntry(ctx.key, { ...copy, date });
    p.log.success(`Added  ${describeEntry(ctx, saved)}`);
  } else if (action === "delete") {
    const ok = unwrap(await p.confirm({ message: `Delete ${formatHours(entry.hours)} on ${dayjs(entry.date).format("MMM D")} (${money(entry.hours * ctx.client.rate)})?`, initialValue: false }));
    if (ok) {
      deleteEntry(ctx.key, month, entry.id);
      p.log.warn(`Deleted  ${entry.task}`);
    }
  }
}

async function addFlow(ctx: Ctx, month: string): Promise<void> {
  const initial = month === currentMonth() ? undefined : dayjs(`${month}-01`).format("M/D/YYYY");
  const date = await askDate("Date", initial);
  const time = await askTime("Time range or hours");
  const { area } = await askArea(ctx.client.areas);
  rememberArea(ctx, area);
  const task = await askText({ message: "What did you do?", required: true });
  const saved = addEntry(ctx.key, { date, ...time, area, task });
  p.log.success(`Added  ${describeEntry(ctx, saved)}`);
}

async function editTitles(ctx: Ctx, month: string): Promise<void> {
  const log = loadMonth(ctx.key, month);
  for (const period of buildPeriods(month, ctx.client.periodSplits)) {
    const title = await askText({
      message: `${period.label} title`,
      initialValue: log.periodTitles[period.key] ?? "",
      placeholder: "MINEDUC Report Reliability + Prepared Reporting",
    });
    if (title) log.periodTitles[period.key] = title;
    else delete log.periodTitles[period.key];
  }
  saveMonth(ctx.key, log);
  p.log.success("Period titles saved.");
}

function editRaw(ctx: Ctx, month: string): void {
  const file = paths.monthLog(ctx.key, month);
  if (!fs.existsSync(file)) saveMonth(ctx.key, loadMonth(ctx.key, month));
  const editor = process.env.VISUAL || process.env.EDITOR || "nano";
  const [cmd, ...args] = editor.split(" ");
  spawnSync(cmd, [...args, file], { stdio: "inherit" });
  const log = loadMonth(ctx.key, month);
  saveMonth(ctx.key, log);
  console.log(`${chalk.green("✔")} ${file} is valid · ${log.entries.length} entries · ${formatHours(totalHours(log.entries))}`);
}
