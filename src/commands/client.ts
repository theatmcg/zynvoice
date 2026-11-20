import * as p from "@clack/prompts";
import chalk from "chalk";
import { listTemplates } from "../lib/render.ts";
import { rateLabel } from "../lib/money.ts";
import { loadConfig, saveConfig, ZynError } from "../lib/store.ts";
import type { Client, Config } from "../lib/schema.ts";
import { askLines, askText, unwrap } from "../ui/prompts.ts";
import { c } from "../ui/theme.ts";
import { createProfile, slugify } from "./profile.ts";

const NEW_PROFILE = "\0new";

function parseSplits(input: string): number[] | null {
  const s = input.trim().toLowerCase();
  if (!s || s === "none" || s === "monthly") return [];
  const nums = s.split(/[\s,]+/).map(Number);
  return nums.every((n) => Number.isInteger(n) && n >= 1 && n <= 30) ? nums : null;
}

async function clientWizard(config: Config, existing?: Client): Promise<Client> {
  const name = await askText({ message: "Client display name", initialValue: existing?.name, placeholder: "OnFire Learning", required: true });
  const billTo = await askLines("Invoice for", existing?.billTo ?? [name], "Kenneth Grover | OnFire Learning");
  const project = await askText({ message: "Project", initialValue: existing?.project, placeholder: "Onfire LMS - Mobile App Development" });
  const rate = Number(
    await askText({
      message: "Hourly rate",
      initialValue: existing ? String(existing.rate) : "55",
      validate: (v) => (Number(v) > 0 ? undefined : "Enter a positive number"),
    }),
  );

  const profileKeys = Object.keys(config.profiles);
  let profile = unwrap(
    await p.select({
      message: "Bill as (sender profile)",
      initialValue: existing?.profile ?? profileKeys[0] ?? NEW_PROFILE,
      options: [
        ...profileKeys.map((k) => ({ value: k, label: config.profiles[k].name, hint: k })),
        { value: NEW_PROFILE, label: "+ New profile…" },
      ],
    }),
  );
  if (profile === NEW_PROFILE) profile = await createProfile(config);

  const areas = await askLines("Work areas (bullet group headings)", existing?.areas, "repo (Backend) | repo (Web Frontend)");
  const splits = parseSplits(
    await askText({
      message: "Line item periods: last day of each split",
      initialValue: (existing?.periodSplits ?? [10, 20]).join(", "),
      placeholder: '"10, 20" gives 1-10, 11-20, 21-end; "monthly" gives one line item',
      validate: (v) => (parseSplits(v) ? undefined : 'Day numbers like "10, 20", or "monthly"'),
    }),
  )!;

  const templates = listTemplates();
  const template =
    templates.length > 1
      ? unwrap(await p.select({ message: "Template", initialValue: existing?.template ?? "classic", options: templates.map((t) => ({ value: t, label: t })) }))
      : (templates[0] ?? "classic");

  const filePrefix = await askText({
    message: "PDF file name prefix",
    initialValue: existing?.filePrefix ?? name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    required: true,
  });
  const nextInvoiceNumber = Number(
    await askText({
      message: "Next invoice number",
      initialValue: String(existing?.nextInvoiceNumber ?? 1001),
      validate: (v) => (/^\d+$/.test(v) && +v > 0 ? undefined : "Whole number"),
    }),
  );
  const dueInput = await askText({
    message: 'Payment due (days after invoice date, or "--" for none)',
    initialValue: existing?.dueDays == null ? "--" : String(existing.dueDays),
    validate: (v) => (v === "--" || v === "" || /^\d+$/.test(v) ? undefined : 'Number of days or "--"'),
  });

  return {
    name,
    profile,
    billTo,
    project,
    rate,
    areas,
    periodSplits: splits,
    filePrefix,
    template,
    nextInvoiceNumber,
    dueDays: /^\d+$/.test(dueInput) ? Number(dueInput) : null,
  };
}

export function clientListCommand(): void {
  const config = loadConfig();
  console.log();
  for (const [key, cl] of Object.entries(config.clients)) {
    const isDefault = key === config.defaultClient;
    const sender = config.profiles[cl.profile]?.name ?? chalk.red(`missing profile ${cl.profile}`);
    console.log(
      `  ${isDefault ? chalk.green("●") : " "} ${chalk.bold(key.padEnd(10))} ${c.title(cl.name)}  ${chalk.green(rateLabel(cl.rate))}  ${c.dim(`next #${cl.nextInvoiceNumber} · ${cl.template}`)}`,
    );
    console.log(`    ${" ".repeat(10)} ${c.dim(`bill to ${cl.billTo.join(", ")} · from ${sender}`)}`);
  }
  console.log(c.dim(`\n  ● default client. Change it with "zyn client use <key>".\n`));
}

export async function clientAddCommand(key?: string): Promise<void> {
  const config = loadConfig();
  p.intro("New client");
  const client = await clientWizard(config);
  const finalKey = await askText({
    message: "Client key (used with -c)",
    initialValue: key ?? slugify(client.name.split(/\s+/)[0]),
    validate: (v) => (/^[a-z0-9-]+$/.test(v) ? (config.clients[v] ? "Already exists" : undefined) : "Lowercase letters, numbers, dashes"),
  });
  config.clients[finalKey] = client;
  config.defaultClient ??= finalKey;
  saveConfig(config);
  p.outro(`Saved client "${finalKey}". Log time with "zyn log -c ${finalKey}" or make it the default with "zyn client use ${finalKey}".`);
}

export async function clientEditCommand(key?: string): Promise<void> {
  const config = loadConfig();
  const target = key ?? config.defaultClient;
  if (!target || !config.clients[target]) throw new ZynError(`Unknown client "${target ?? ""}".`);
  p.intro(`Edit client "${target}"`);
  config.clients[target] = await clientWizard(config, config.clients[target]);
  saveConfig(config);
  p.outro(`Saved client "${target}".`);
}

export function clientUseCommand(key: string): void {
  const config = loadConfig();
  if (!config.clients[key]) throw new ZynError(`Unknown client "${key}".`);
  config.defaultClient = key;
  saveConfig(config);
  console.log(`${chalk.green("✔")} Default client is now ${chalk.bold(key)} (${config.clients[key].name}).`);
}

/** Quick switch of who a client is billed from, e.g. "zyn client bill-as onfire aiden". */
export function clientBillAsCommand(key: string, profile: string): void {
  const config = loadConfig();
  if (!config.clients[key]) throw new ZynError(`Unknown client "${key}".`);
  if (!config.profiles[profile]) throw new ZynError(`Unknown profile "${profile}". Known: ${Object.keys(config.profiles).join(", ")}`);
  config.clients[key].profile = profile;
  saveConfig(config);
  console.log(`${chalk.green("✔")} ${config.clients[key].name} invoices now come from ${chalk.bold(config.profiles[profile].name)}.`);
}
