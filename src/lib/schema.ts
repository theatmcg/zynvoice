import { z } from "zod";

export const ProfileSchema = z.object({
  name: z.string().min(1),
  address: z.array(z.string()).default([]),
  phone: z.string().optional(),
  email: z.string().optional(),
  /** Extra lines printed under "Payable to", e.g. payment instructions. */
  paymentNotes: z.array(z.string()).default([]),
});

export const GitRepoSchema = z.object({
  path: z.string().min(1),
  name: z.string().optional(),
  /** Area for commits that don't match any rule. */
  defaultArea: z.string().optional(),
  /** First rule whose path prefixes cover most of a commit's files decides its area. */
  areaRules: z.array(z.object({ area: z.string(), paths: z.array(z.string()).min(1) })).default([]),
});

export const GitConfigSchema = z.object({
  /** Author emails (or name substrings) that count as your work. */
  authors: z.array(z.string()).default([]),
  /** Run `git fetch` before suggesting, at most every `fetchEveryMinutes`. */
  fetch: z.boolean().default(true),
  fetchEveryMinutes: z.number().nonnegative().default(20),
  repos: z.array(GitRepoSchema).default([]),
});

export const ClientSchema = z.object({
  name: z.string().min(1),
  profile: z.string().min(1),
  billTo: z.array(z.string()).min(1),
  project: z.string().default(""),
  rate: z.number().positive(),
  areas: z.array(z.string()).default([]),
  /** Last day of each period except the final one, e.g. [10, 20] -> 1-10, 11-20, 21-end. */
  periodSplits: z.array(z.number().int().min(1).max(30)).default([10, 20]),
  filePrefix: z.string().min(1),
  template: z.string().default("ocean"),
  nextInvoiceNumber: z.number().int().positive().default(1),
  /** Days after the invoice date the payment is due. Null prints "--". */
  dueDays: z.number().int().nonnegative().nullable().default(null),
  git: GitConfigSchema.optional(),
});

export const DisplaySchema = z.object({
  /** Slot-machine count-up on the dashboard. */
  animate: z.boolean().default(true),
});

export const ConfigSchema = z.object({
  defaultClient: z.string().optional(),
  /** Monthly salary, added to the dashboard with `zyn -s`. */
  salary: z.number().nonnegative().optional(),
  display: DisplaySchema.default({ animate: true }),
  profiles: z.record(z.string(), ProfileSchema).default({}),
  clients: z.record(z.string(), ClientSchema).default({}),
});

export const EntrySchema = z.object({
  id: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hours: z.number().positive(),
  start: z.string().optional(),
  end: z.string().optional(),
  area: z.string(),
  task: z.string(),
});

export const MonthLogSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  entries: z.array(EntrySchema).default([]),
  /** Period title keyed by "<startDay>-<endDay>". */
  periodTitles: z.record(z.string(), z.string()).default({}),
});

export type GitRepo = z.infer<typeof GitRepoSchema>;
export type GitConfig = z.infer<typeof GitConfigSchema>;
export type Display = z.infer<typeof DisplaySchema>;
export type Profile = z.infer<typeof ProfileSchema>;
export type Client = z.infer<typeof ClientSchema>;
export type Config = z.infer<typeof ConfigSchema>;
export type Entry = z.infer<typeof EntrySchema>;
export type MonthLog = z.infer<typeof MonthLogSchema>;
