import * as p from "@clack/prompts";
import { configExists, loadConfig, paths, saveConfig } from "../lib/store.ts";
import type { Client, Config, Profile } from "../lib/schema.ts";
import { askLines, askText, unwrap } from "../ui/prompts.ts";

export const ONESOURCE_PROFILE: Profile = {
  name: "OneSource, LLC",
  address: ["1683 South Ash Creek Drive", "Toquerville, UT 84774"],
  phone: "(435) 313-2928",
  paymentNotes: [],
};

export const DEFAULT_ONFIRE: Client = {
  name: "OnFire Learning",
  profile: "aiden",
  billTo: ["Kenneth Grover", "OnFire Learning"],
  project: "Onfire LMS - Mobile App Development",
  rate: 55,
  areas: ["spark-lms (Backend / Mobile Backend)", "spark-lms (Web Frontend)", "onfire-learning-app (Mobile)"],
  periodSplits: [10, 20],
  filePrefix: "OnFire-Learning",
  template: "classic",
  nextInvoiceNumber: 54371,
  dueDays: null,
};

export async function initCommand(opts: { yes?: boolean }): Promise<void> {
  const config: Config = configExists() ? loadConfig() : { profiles: {}, clients: {} };
  const existingMe = config.profiles.aiden;
  const existingClient = config.clients.onfire;

  if (opts.yes) {
    config.profiles.aiden ??= { name: "Aiden McGuire", address: [], paymentNotes: [] };
    config.profiles.onesource ??= ONESOURCE_PROFILE;
    config.clients.onfire ??= DEFAULT_ONFIRE;
    config.defaultClient ??= "onfire";
    saveConfig(config);
    console.log(`Wrote ${paths.config()}`);
    return;
  }

  p.intro("zynvoice setup");
  p.log.info("First, the details printed at the top of your invoices (who the client pays).");

  const me: Profile = {
    name: await askText({ message: "Your name", initialValue: existingMe?.name ?? "Aiden McGuire", required: true }),
    address: await askLines("Mailing address", existingMe?.address, "123 Main St | St. George, UT 84770"),
    phone: (await askText({ message: "Phone", initialValue: existingMe?.phone, placeholder: "(435) 555-0123" })) || undefined,
    email: (await askText({ message: "Email (optional)", initialValue: existingMe?.email })) || undefined,
    paymentNotes: existingMe?.paymentNotes ?? [],
  };

  p.log.info("Now the OnFire client. Press Enter to keep each default.");
  const base = existingClient ?? DEFAULT_ONFIRE;
  const rate = await askText({
    message: "Hourly rate",
    initialValue: String(base.rate),
    validate: (v) => (Number(v) > 0 ? undefined : "Enter a positive number"),
  });
  const nextNumber = await askText({
    message: "Next invoice number",
    initialValue: String(base.nextInvoiceNumber),
    validate: (v) => (/^\d+$/.test(v) ? undefined : "Whole number"),
  });
  const billTo = await askLines("Invoice for", base.billTo);

  config.profiles.aiden = me;
  config.profiles.onesource ??= ONESOURCE_PROFILE;
  config.clients.onfire = { ...base, profile: "aiden", rate: Number(rate), nextInvoiceNumber: Number(nextNumber), billTo };
  config.defaultClient ??= "onfire";

  const ok = unwrap(await p.confirm({ message: `Save to ${paths.config()}?`, initialValue: true }));
  if (!ok) return p.cancel("Nothing saved.");
  saveConfig(config);
  p.outro(`Saved. Try "zyn log" to add your first entry.`);
}
