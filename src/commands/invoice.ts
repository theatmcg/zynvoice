import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import * as p from "@clack/prompts";
import chalk from "chalk";
import dayjs from "dayjs";
import { currentMonth, longDate, monthLabel, parseDate, parseMonth, today } from "../lib/dates.ts";
import { formatHours } from "../lib/hours.ts";
import { buildInvoice, defaultInvoiceDate, invoiceFileName, type InvoiceOptions } from "../lib/invoice.ts";
import { money } from "../lib/money.ts";
import { summarizePeriods } from "../lib/periods.ts";
import { renderHtml, renderPdf } from "../lib/render.ts";
import { listInvoices, loadMonth, paths, saveConfig, saveMonth, writeJson, ZynError, type InvoiceRecord } from "../lib/store.ts";
import { askText, unwrap } from "../ui/prompts.ts";
import { c } from "../ui/theme.ts";
import { getCtx, type Ctx } from "./context.ts";

interface InvoiceCmdOpts {
  client?: string;
  yes?: boolean;
  number?: string;
  date?: string;
  due?: string;
  adjust?: string;
  out?: string;
  html?: boolean;
  open?: boolean;
}

/** Early in a month you're usually billing the previous one, if it hasn't been invoiced yet. */
function defaultMonth(ctx: Ctx): string {
  const now = today();
  const prev = now.subtract(1, "month").format("YYYY-MM");
  const prevHasWork = loadMonth(ctx.key, prev).entries.length > 0;
  const prevInvoiced = listInvoices(ctx.key).some((i) => i.month === prev);
  const curHasWork = loadMonth(ctx.key, currentMonth()).entries.length > 0;
  if (prevHasWork && !prevInvoiced && (now.date() <= 7 || !curHasWork)) return prev;
  return currentMonth();
}

function parseDue(input: string, invoiceDate: string): string | null | undefined {
  const s = input.trim();
  if (!s || s === "--" || s === "-" || s.toLowerCase() === "none") return null;
  const rel = s.match(/^\+?(\d+)\s*d?$/i);
  if (rel && s.startsWith("+")) return dayjs(invoiceDate).add(+rel[1], "day").format("YYYY-MM-DD");
  return parseDate(s) ?? undefined;
}

function parseMoney(input: string): number | null {
  const s = input.replace(/[$,\s]/g, "");
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function invoiceCommand(monthArg: string | undefined, opts: InvoiceCmdOpts): Promise<void> {
  const ctx = getCtx(opts.client);
  const { client, profile } = ctx;
  const month = monthArg ? parseMonth(monthArg) : defaultMonth(ctx);
  const log = loadMonth(ctx.key, month);
  if (!log.entries.length) throw new ZynError(`No hours logged for ${monthLabel(month)}.`);

  const interactive = !opts.yes;
  const periods = summarizePeriods(month, log.entries, client.periodSplits, client.areas).filter((pd) => pd.entries.length);

  if (interactive) {
    p.intro(`${chalk.bold("Invoice")} · ${client.name} · ${monthLabel(month)} · ${c.dim(`from ${profile.name}`)}`);
    p.log.message(
      periods.map((pd) => `${chalk.white(pd.label.padEnd(10))} ${c.hours(pd.hours).padEnd(18)} ${c.money(pd.hours * client.rate)}`).join("\n"),
    );
    p.log.info("Give each line item a short title (Enter keeps the saved one).");
  }

  const titles = { ...log.periodTitles };
  if (interactive) {
    for (const pd of periods) {
      const hint = pd.groups.map((g) => g.area.replace(/\s*\(.*\)$/, "")).join(", ");
      const title = await askText({
        message: `${pd.label} title`,
        initialValue: titles[pd.key] ?? "",
        placeholder: `e.g. what you shipped in ${hint}`,
      });
      if (title) titles[pd.key] = title;
      else delete titles[pd.key];
    }
    log.periodTitles = titles;
    saveMonth(ctx.key, log);
  }

  const defaultDate = defaultInvoiceDate(month);
  const defaultDue = client.dueDays === null ? "" : `+${client.dueDays}`;

  let number = Number(opts.number ?? client.nextInvoiceNumber);
  let date = opts.date ? parseDate(opts.date) : defaultDate;
  let dueInput = opts.due ?? defaultDue;
  let adjustments = parseMoney(opts.adjust ?? "0");
  if (!Number.isInteger(number) || number <= 0) throw new ZynError(`Invalid invoice number "${opts.number}".`);
  if (!date) throw new ZynError(`Could not understand date "${opts.date}".`);
  if (adjustments === null) throw new ZynError(`Invalid adjustment "${opts.adjust}".`);

  if (interactive) {
    number = Number(
      await askText({
        message: "Invoice #",
        initialValue: String(number),
        validate: (v) => (/^\d+$/.test(v) ? undefined : "Whole number"),
      }),
    );
    date = parseDate(
      await askText({
        message: "Invoice date",
        initialValue: dayjs(date).format("M/D/YYYY"),
        validate: (v) => (parseDate(v) ? undefined : "Try 12/1, 2026-12-01, today"),
      }),
    )!;
    const invoiceDate = date;
    dueInput = await askText({
      message: "Due date",
      initialValue: dueInput,
      placeholder: '"--" for none, +15 for 15 days, or 12/15',
      validate: (v) => (parseDue(v, invoiceDate) === undefined ? "Try --, +15, or 12/15" : undefined),
    });
    adjustments = parseMoney(
      await askText({
        message: "Adjustments (negative for a discount)",
        initialValue: "0",
        validate: (v) => (parseMoney(v) === null ? "Enter an amount like -50 or 25.00" : undefined),
      }),
    )!;
  }

  const due = parseDue(dueInput, date);
  if (due === undefined) throw new ZynError(`Could not understand due date "${dueInput}".`);

  const invoiceOpts: InvoiceOptions = { number, date, due, adjustments: adjustments!, titles };
  const built = buildInvoice(client, profile, month, log.entries, invoiceOpts);

  if (interactive) {
    p.log.message(
      [
        `${c.label("Invoice for")}  ${client.billTo.join(", ")}`,
        `${c.label("Payable to")}   ${profile.name}`,
        `${c.label("Date / due")}   ${longDate(date)} · ${due ? longDate(due) : "--"}`,
        `${c.label("Hours")}        ${c.hours(built.hours)} × ${money(client.rate)}`,
        `${c.label("Subtotal")}     ${c.moneySoft(built.subtotal)}${adjustments ? `  ${c.label("adj")} ${money(adjustments!)}` : ""}`,
        `${c.label("Total")}        ${c.money(built.total)}`,
      ].join("\n"),
    );
    const ok = unwrap(await p.confirm({ message: opts.html ? "Write HTML preview?" : "Generate PDF?", initialValue: true }));
    if (!ok) return p.cancel("Nothing generated. Titles were saved.");
  }

  const outDir = opts.out ? path.resolve(opts.out) : paths.invoices(ctx.key);
  const fileName = invoiceFileName(client, month, number);
  const html = renderHtml(built.view, client.template);
  let outFile: string;

  if (opts.html) {
    outFile = path.join(outDir, fileName.replace(/\.pdf$/, ".html"));
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, html);
  } else {
    outFile = path.join(outDir, fileName);
    const spin = interactive ? p.spinner() : null;
    spin?.start("Rendering PDF");
    await renderPdf(html, outFile);
    spin?.stop("PDF ready");

    const record: InvoiceRecord & Record<string, unknown> = {
      month,
      number,
      date,
      total: built.total,
      totalLabel: money(built.total),
      pdf: outFile,
      client: ctx.key,
      profile: client.profile,
      rate: client.rate,
      hours: built.hours,
      subtotal: built.subtotal,
      adjustments,
      due,
      items: built.view.items,
    };
    writeJson(path.join(paths.invoices(ctx.key), fileName.replace(/\.pdf$/, ".json")), record);

    if (number >= client.nextInvoiceNumber) {
      client.nextInvoiceNumber = number + 1;
      saveConfig(ctx.config);
    }
  }

  if (opts.open !== false) spawn(process.platform === "darwin" ? "open" : "xdg-open", [outFile], { detached: true, stdio: "ignore" }).unref();

  const summary = `${chalk.bold(`#${number}`)} · ${formatHours(built.hours)} · ${c.money(built.total)}\n   ${c.dim(outFile)}`;
  if (interactive) p.outro(summary);
  else console.log(`${chalk.green("✔")} Invoice ${summary}`);
}
