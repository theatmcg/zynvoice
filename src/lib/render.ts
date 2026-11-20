import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";
import { homeDir, ZynError } from "./store.ts";

const require = createRequire(import.meta.url);
const repoTemplates = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../templates");

export interface InvoiceItem {
  title: string;
  groups: { area: string; tasks: string[] }[];
  qty: string;
  unitPrice: string;
  total: string;
}

export interface InvoiceView {
  sender: { name: string; address: string[]; phone?: string; email?: string; paymentNotes: string[] };
  billTo: string[];
  project: string;
  number: string;
  dateLabel: string;
  dueLabel: string;
  totals: { qty: string; subtotal: string; adjustments: string; total: string };
  items: InvoiceItem[];
}

/** Templates in ~/.zynvoice/templates/<name> override the ones shipped in the repo. */
export function templateDir(name: string): string {
  for (const base of [path.join(homeDir(), "templates"), repoTemplates]) {
    const dir = path.join(base, name);
    if (fs.existsSync(path.join(dir, "invoice.hbs"))) return dir;
  }
  throw new ZynError(`Template "${name}" not found in ~/.zynvoice/templates or ${repoTemplates}.`);
}

export function listTemplates(): string[] {
  const names = new Set<string>();
  for (const base of [path.join(homeDir(), "templates"), repoTemplates]) {
    if (!fs.existsSync(base)) continue;
    for (const d of fs.readdirSync(base)) if (fs.existsSync(path.join(base, d, "invoice.hbs"))) names.add(d);
  }
  return [...names];
}

function fontCss(): string {
  const faces = [
    ["normal", "@fontsource-variable/roboto/files/roboto-latin-wght-normal.woff2"],
    ["italic", "@fontsource-variable/roboto/files/roboto-latin-wght-italic.woff2"],
  ];
  return faces
    .map(([style, mod]) => {
      const data = fs.readFileSync(require.resolve(mod)).toString("base64");
      return `@font-face{font-family:"Roboto";font-style:${style};font-weight:100 900;font-display:block;src:url(data:font/woff2;base64,${data}) format("woff2");}`;
    })
    .join("\n");
}

export function renderHtml(view: InvoiceView, template: string): string {
  const dir = templateDir(template);
  const source = fs.readFileSync(path.join(dir, "invoice.hbs"), "utf8");
  const cssFile = path.join(dir, "style.css");
  const css = fs.existsSync(cssFile) ? fs.readFileSync(cssFile, "utf8") : "";
  return Handlebars.compile(source)({ ...view, css, fontCss: fontCss() });
}

const SYSTEM_CHROME = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

async function chromePath(): Promise<string | undefined> {
  if (process.env.ZYNVOICE_CHROME) return process.env.ZYNVOICE_CHROME;
  const puppeteer = (await import("puppeteer")).default;
  try {
    const bundled = await puppeteer.executablePath();
    if (bundled && fs.existsSync(bundled)) return bundled;
  } catch {
    // no bundled browser downloaded
  }
  return SYSTEM_CHROME.find((p) => fs.existsSync(p));
}

export async function renderPdf(html: string, outFile: string): Promise<void> {
  const puppeteer = (await import("puppeteer")).default;
  const executablePath = await chromePath();
  if (!executablePath) {
    throw new ZynError("No Chrome found. Install Google Chrome, run `npx puppeteer browsers install chrome`, or set ZYNVOICE_CHROME.");
  }
  const browser = await puppeteer.launch({ headless: true, executablePath });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluateHandle("document.fonts.ready");
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    await page.pdf({ path: outFile, preferCSSPageSize: true, printBackground: true });
  } finally {
    await browser.close();
  }
}
