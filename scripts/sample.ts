/**
 * Renders the October 2026 reference invoice from fixtures, for template work:
 *   npm run sample -- [template] [--html]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_ONFIRE, ONESOURCE_PROFILE } from "../src/commands/init.ts";
import { buildInvoice } from "../src/lib/invoice.ts";
import { renderHtml, renderPdf } from "../src/lib/render.ts";
import { MonthLogSchema } from "../src/lib/schema.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const template = args.find((a) => !a.startsWith("--")) ?? "classic";
const log = MonthLogSchema.parse(JSON.parse(fs.readFileSync(path.join(root, "test/fixtures/october-2026.json"), "utf8")));

const client = { ...DEFAULT_ONFIRE, profile: "onesource", rate: 75, template };
const { view, hours, total } = buildInvoice(client, ONESOURCE_PROFILE, log.month, log.entries, {
  number: 54370,
  date: "2026-11-01",
  due: null,
  adjustments: 0,
  titles: log.periodTitles,
});

const html = renderHtml(view, template);
const outDir = path.join(root, "out");
fs.mkdirSync(outDir, { recursive: true });
if (args.includes("--html")) {
  fs.writeFileSync(path.join(outDir, "sample.html"), html);
  console.log(path.join(outDir, "sample.html"));
} else {
  const file = path.join(outDir, "sample.pdf");
  await renderPdf(html, file);
  console.log(`${file}  (${hours} hrs, $${total.toFixed(2)})`);
}
