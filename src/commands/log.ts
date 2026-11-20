import * as p from "@clack/prompts";
import chalk from "chalk";
import dayjs from "dayjs";
import { parseDate, shortDate, monthLabel } from "../lib/dates.ts";
import { parseTime } from "../lib/hours.ts";
import { addEntry, loadMonth, monthOf, ZynError } from "../lib/store.ts";
import { totalHours } from "../lib/periods.ts";
import type { Entry } from "../lib/schema.ts";
import { c } from "../ui/theme.ts";
import { askArea, askDate, askText, askTime, unwrap } from "../ui/prompts.ts";
import { getCtx, matchArea, rememberArea, type Ctx } from "./context.ts";
import { gitCtxSession, pickFromGit, type GitPick } from "./git.ts";

interface LogOpts {
  client?: string;
  area?: string;
  date?: string;
}

export function describeEntry(ctx: Ctx, e: Omit<Entry, "id">): string {
  const range = e.start && e.end ? c.dim(` ${e.start}-${e.end}`) : "";
  return `${chalk.bold(shortDate(e.date))}  ${c.hours(e.hours)}${range}  ${c.moneySoft(e.hours * ctx.client.rate)}  ${c.dim(e.area)}  ${e.task}`;
}

function monthTotalLine(ctx: Ctx, month: string): string {
  const hours = totalHours(loadMonth(ctx.key, month).entries);
  return `${monthLabel(month)}: ${c.hours(hours)} · ${c.money(hours * ctx.client.rate)}`;
}

export async function logCommand(time: string | undefined, taskWords: string[], opts: LogOpts): Promise<void> {
  const ctx = getCtx(opts.client);

  if (time) {
    const parsed = parseTime(time);
    if (!parsed) throw new ZynError(`Could not understand time "${time}". Try 1.5, 1h15m, 90m, or 10:30am-11:45am.`);
    const date = parseDate(opts.date);
    if (!date) throw new ZynError(`Could not understand date "${opts.date}".`);
    let task = taskWords.join(" ").trim();
    let pick: GitPick | null = null;
    if (!task) {
      pick = await pickFromGit(gitCtxSession(ctx), date);
      task = await askText({ message: "What did you do?", initialValue: pick?.task, required: true });
    }
    let area: string;
    if (opts.area) {
      area = matchArea(ctx.client.areas, opts.area);
    } else {
      area = (await askArea(ctx.client.areas, pick?.area)).area;
    }
    rememberArea(ctx, area);
    const entry = addEntry(ctx.key, { date, ...parsed, area, task });
    console.log(`${chalk.green("✔")} Logged  ${describeEntry(ctx, entry)}`);
    console.log(`  ${monthTotalLine(ctx, monthOf(date))}`);
    return;
  }

  p.intro(`${chalk.bold("Log work")} · ${ctx.client.name} · ${c.dim(`$${ctx.client.rate}/hr`)}`);
  let lastDate: string | undefined;
  let lastArea: string | undefined;
  const logged: Entry[] = [];
  const git = gitCtxSession(ctx);

  while (true) {
    const date = await askDate("Date", lastDate ? dayjs(lastDate).format("M/D") : undefined);
    const pick = await pickFromGit(git, date);
    const parsed = await askTime(`Time range or hours${pick?.span ? c.dim(`  (commits ${pick.span})`) : ""}`);
    const { area } = await askArea(ctx.client.areas, pick?.area ?? lastArea);
    rememberArea(ctx, area);
    const task = await askText({
      message: "What did you do?",
      initialValue: pick?.task,
      required: true,
      placeholder: "Fixed quiz grading for incomplete answer keys (OLMS-260)",
    });

    const entry = addEntry(ctx.key, { date, ...parsed, area, task });
    logged.push(entry);
    lastDate = date;
    lastArea = area;
    p.log.success(describeEntry(ctx, entry));

    const again = unwrap(await p.confirm({ message: "Log another?", initialValue: true }));
    if (!again) break;
  }

  const hours = totalHours(logged);
  const months = [...new Set(logged.map((e) => monthOf(e.date)))];
  p.outro(
    `Added ${logged.length} ${logged.length === 1 ? "entry" : "entries"} (${c.hours(hours)}, ${c.money(hours * ctx.client.rate)})\n` +
      months.map((m) => `   ${monthTotalLine(ctx, m)}`).join("\n"),
  );
}
