import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  ConfigSchema,
  MonthLogSchema,
  type Client,
  type Config,
  type Entry,
  type MonthLog,
  type Profile,
} from "./schema.ts";

export class ZynError extends Error {}

export function homeDir(): string {
  return process.env.ZYNVOICE_HOME ?? path.join(os.homedir(), ".zynvoice");
}

export const paths = {
  config: () => path.join(homeDir(), "config.json"),
  monthLog: (client: string, month: string) => path.join(homeDir(), "logs", client, `${month}.json`),
  invoices: (client: string) => path.join(homeDir(), "invoices", client),
  gitCache: () => path.join(homeDir(), "cache", "git-fetch.json"),
};

function readJson<T>(file: string, schema: z.ZodType<T>): T {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ZynError(`Invalid data in ${file}:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

export function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

export function configExists(): boolean {
  return fs.existsSync(paths.config());
}

export function loadConfig(): Config {
  if (!configExists()) {
    throw new ZynError(`No config found at ${paths.config()}. Run "zyn init" first.`);
  }
  return readJson(paths.config(), ConfigSchema);
}

export function saveConfig(config: Config): void {
  writeJson(paths.config(), ConfigSchema.parse(config));
}

export interface ResolvedClient {
  key: string;
  client: Client;
  profile: Profile;
}

export function resolveClient(config: Config, key?: string): ResolvedClient {
  const clientKey = key ?? config.defaultClient ?? Object.keys(config.clients)[0];
  if (!clientKey) throw new ZynError(`No clients configured. Run "zyn client add".`);
  const client = config.clients[clientKey];
  if (!client) {
    const known = Object.keys(config.clients).join(", ") || "none";
    throw new ZynError(`Unknown client "${clientKey}". Known clients: ${known}`);
  }
  const profile = config.profiles[client.profile];
  if (!profile) throw new ZynError(`Client "${clientKey}" uses unknown profile "${client.profile}".`);
  return { key: clientKey, client, profile };
}

export function loadMonth(client: string, month: string): MonthLog {
  const file = paths.monthLog(client, month);
  if (!fs.existsSync(file)) return { month, entries: [], periodTitles: {} };
  return readJson(file, MonthLogSchema);
}

export function saveMonth(client: string, log: MonthLog): void {
  log.entries.sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? "").localeCompare(b.start ?? ""));
  writeJson(paths.monthLog(client, log.month), MonthLogSchema.parse(log));
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function newEntryId(): string {
  return randomUUID().slice(0, 8);
}

export function addEntry(client: string, entry: Omit<Entry, "id">): Entry {
  const log = loadMonth(client, monthOf(entry.date));
  const saved = { id: newEntryId(), ...entry };
  log.entries.push(saved);
  saveMonth(client, log);
  return saved;
}

/** Writes an edited entry, moving it to another month file if its date changed months. */
export function updateEntry(client: string, fromMonth: string, entry: Entry): void {
  const toMonth = monthOf(entry.date);
  const from = loadMonth(client, fromMonth);
  from.entries = from.entries.filter((e) => e.id !== entry.id);
  if (toMonth === fromMonth) {
    from.entries.push(entry);
    saveMonth(client, from);
    return;
  }
  saveMonth(client, from);
  const to = loadMonth(client, toMonth);
  to.entries.push(entry);
  saveMonth(client, to);
}

export interface InvoiceRecord {
  month: string;
  number: number;
  date: string;
  total: number;
  totalLabel: string;
  pdf: string;
}

/** Snapshots written next to each generated PDF, oldest first. */
export function listInvoices(client: string): InvoiceRecord[] {
  const dir = paths.invoices(client);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as InvoiceRecord)
    .filter((r) => r && r.month && r.number)
    .sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number);
}

export function deleteEntry(client: string, month: string, id: string): void {
  const log = loadMonth(client, month);
  log.entries = log.entries.filter((e) => e.id !== id);
  saveMonth(client, log);
}
