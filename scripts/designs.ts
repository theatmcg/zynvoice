/**
 * Renders the current month in the ocean, charcoal, and grove templates.
 * Writes PDFs under out/designs and does not touch ~/.zynvoice.
 *
 *   npm run designs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dayjs from "dayjs";
import { currentMonth } from "../src/lib/dates.ts";
import { buildInvoice, defaultInvoiceDate } from "../src/lib/invoice.ts";
import { renderHtml, renderPdf } from "../src/lib/render.ts";
import { listInvoices, loadConfig, loadMonth, resolveClient, type InvoiceRecord } from "../src/lib/store.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templates = ["ocean", "charcoal", "grove"];

const config = loadConfig();
const { key, client, profile } = resolveClient(config);
const month = currentMonth();
const log = loadMonth(key, month);
if (!log.entries.length) throw new Error(`No hours logged for ${month}.`);

type Issued = InvoiceRecord & { due?: string | null; adjustments?: number };
const issued = listInvoices(key).filter((r) => r.month === month).at(-1) as Issued | undefined;

const date = issued?.date ?? defaultInvoiceDate(month);
const due = issued ? (issued.due ?? null) : client.dueDays === null ? null : dayjs(date).add(client.dueDays, "day").format("YYYY-MM-DD");
const built = buildInvoice(client, profile, month, log.entries, {
  number: issued?.number ?? client.nextInvoiceNumber,
  date,
  due,
  adjustments: issued?.adjustments ?? 0,
  titles: log.periodTitles,
});

const outDir = path.join(root, "out", "designs");
fs.mkdirSync(outDir, { recursive: true });

for (const template of templates) {
  const html = renderHtml(built.view, template);
  const base = path.join(outDir, `${client.filePrefix}-${month}-${template}`);
  fs.writeFileSync(`${base}.html`, html);
  const pdf = `${base}.pdf`;
  await renderPdf(html, pdf);
  console.log(pdf);
}
