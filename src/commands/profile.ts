import * as p from "@clack/prompts";
import chalk from "chalk";
import { loadConfig, saveConfig, ZynError } from "../lib/store.ts";
import type { Config, Profile } from "../lib/schema.ts";
import { askLines, askText, unwrap } from "../ui/prompts.ts";
import { c } from "../ui/theme.ts";

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function profileWizard(existing?: Profile): Promise<Profile> {
  return {
    name: await askText({ message: "Name printed on the invoice", initialValue: existing?.name, required: true }),
    address: await askLines("Address", existing?.address, "123 Main St | St. George, UT 84770"),
    phone: (await askText({ message: "Phone", initialValue: existing?.phone })) || undefined,
    email: (await askText({ message: "Email", initialValue: existing?.email })) || undefined,
    paymentNotes: await askLines("Payment notes under \"Payable to\" (optional)", existing?.paymentNotes, "Venmo @aiden | Zelle aiden@example.com"),
  };
}

/** Creates a profile interactively and stores it in `config` (caller saves). */
export async function createProfile(config: Config, suggestedKey?: string): Promise<string> {
  const profile = await profileWizard();
  const key = await askText({
    message: "Profile key (short id)",
    initialValue: suggestedKey ?? slugify(profile.name.split(/[ ,]/)[0]),
    validate: (v) => (/^[a-z0-9-]+$/.test(v) ? undefined : "Lowercase letters, numbers, dashes"),
  });
  config.profiles[key] = profile;
  return key;
}

export function profileListCommand(): void {
  const config = loadConfig();
  const usedBy = (key: string) =>
    Object.entries(config.clients)
      .filter(([, cl]) => cl.profile === key)
      .map(([k]) => k);
  console.log();
  for (const [key, pr] of Object.entries(config.profiles)) {
    const users = usedBy(key);
    console.log(`  ${chalk.bold(key.padEnd(12))} ${c.title(pr.name)}  ${users.length ? c.dim(`used by ${users.join(", ")}`) : c.dim("unused")}`);
    const details = [...pr.address, pr.phone, pr.email, ...pr.paymentNotes].filter(Boolean);
    if (details.length) console.log(`  ${" ".repeat(12)} ${c.dim(details.join(" · "))}`);
  }
  console.log();
}

export async function profileAddCommand(key?: string): Promise<void> {
  const config = loadConfig();
  p.intro("New sender profile");
  const saved = await createProfile(config, key);
  saveConfig(config);
  p.outro(`Saved profile "${saved}". Use it with "zyn client edit".`);
}

export async function profileEditCommand(key?: string): Promise<void> {
  const config = loadConfig();
  const keys = Object.keys(config.profiles);
  if (!keys.length) throw new ZynError(`No profiles yet. Run "zyn profile add".`);
  p.intro("Edit sender profile");
  const target =
    key ??
    unwrap(
      await p.select({
        message: "Which profile?",
        options: keys.map((k) => ({ value: k, label: `${k} · ${config.profiles[k].name}` })),
      }),
    );
  const existing = config.profiles[target];
  if (!existing) throw new ZynError(`Unknown profile "${target}".`);
  config.profiles[target] = await profileWizard(existing);
  saveConfig(config);
  p.outro(`Saved profile "${target}".`);
}
