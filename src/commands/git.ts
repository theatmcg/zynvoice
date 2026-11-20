import os from "node:os";
import path from "node:path";
import * as p from "@clack/prompts";
import chalk from "chalk";
import dayjs from "dayjs";
import { shortDate, today } from "../lib/dates.ts";
import { formatHours } from "../lib/hours.ts";
import {
  commitToTask,
  detectAuthors,
  expandHome,
  fetchStale,
  groupBranches,
  isGitRepo,
  readCommits,
  repoName,
  suggestionsFor,
  type BranchSuggestion,
  type GitCommit,
} from "../lib/git.ts";
import { loadMonth, saveConfig, ZynError } from "../lib/store.ts";
import type { GitConfig, GitRepo } from "../lib/schema.ts";
import { askLines, askText, unwrap } from "../ui/prompts.ts";
import { c, truncate } from "../ui/theme.ts";
import { getCtx, type Ctx } from "./context.ts";

/** Identities that count as Aiden's work in the OnFire repos. */
export const ONFIRE_AUTHORS = [
  "chris@onesource.host",
  "34201153+chris-mcguire@users.noreply.github.com",
  "84194456+theatmcg@users.noreply.github.com",
];

export function defaultOnfireGit(): GitConfig | undefined {
  const sparkPath = path.join(os.homedir(), "Developer", "spark-lms");
  if (!isGitRepo(sparkPath)) return undefined;
  return {
    authors: [...new Set([...ONFIRE_AUTHORS, ...detectAuthors(sparkPath)])],
    fetch: true,
    fetchEveryMinutes: 20,
    repos: [
      {
        path: "~/Developer/spark-lms",
        name: "spark-lms",
        defaultArea: "spark-lms (Backend / Mobile Backend)",
        areaRules: [{ area: "spark-lms (Web Frontend)", paths: ["public/js/", "public/css/", "views/"] }],
      },
    ],
  };
}

function shortArea(area?: string): string {
  return area ? area.replace(/^.*\((.*)\)$/, "$1") : "";
}

/** Loads commits once per session and fetches in the background the first time. */
export class GitSession {
  private commits?: GitCommit[];
  private since?: string;
  private fetching?: Promise<unknown>;

  constructor(private cfg: GitConfig | undefined) {
    if (cfg?.repos.length) this.fetching = fetchStale(cfg);
  }

  get enabled(): boolean {
    return !!this.cfg?.repos.length;
  }

  async commitsSince(day: string): Promise<GitCommit[]> {
    if (!this.cfg) return [];
    if (this.fetching) {
      const spin = p.spinner();
      let shown = false;
      const timer = setTimeout(() => {
        shown = true;
        spin.start("Fetching latest branches");
      }, 150);
      await this.fetching;
      clearTimeout(timer);
      if (shown) spin.stop("Branches up to date");
      this.fetching = undefined;
    }
    if (!this.commits || !this.since || day < this.since) {
      this.since = day;
      this.commits = readCommits(this.cfg, day);
    }
    return this.commits.filter((c) => c.day >= day);
  }
}

export interface GitPick {
  task?: string;
  area?: string;
  span?: string;
}

const SKIP = "\0skip";

/** Offers branches you committed to on `date` (and the week before) and turns the pick into a task. */
export async function pickFromGit(session: GitSession, date: string): Promise<GitPick | null> {
  if (!session.enabled) return null;
  const commits = await session.commitsSince(dayjs(date).subtract(7, "day").format("YYYY-MM-DD"));
  const s = suggestionsFor(commits, date);
  if (!s.sameDay.length && !s.recent.length) return null;

  const option = (b: BranchSuggestion, sameDay: boolean) => ({
    value: `${b.repo}\0${b.branch}`,
    label: b.branch,
    hint: [
      sameDay ? `${b.commits.length} commit${b.commits.length === 1 ? "" : "s"} that day` : `last commit ${shortDate(b.lastDay)}`,
      shortArea(b.area),
    ]
      .filter(Boolean)
      .join(" · "),
  });
  const choice = unwrap(
    await p.select<string>({
      message: `Worked on ${c.dim(s.span ? `(git: commits ${s.span})` : "(git: no commits that day, recent branches)")}`,
      maxItems: 10,
      options: [...s.sameDay.map((b) => option(b, true)), ...s.recent.map((b) => option(b, false)), { value: SKIP, label: c.dim("Something else") }],
    }),
  );
  if (choice === SKIP) return { span: s.span };

  const branch = [...s.sameDay, ...s.recent].find((b) => `${b.repo}\0${b.branch}` === choice)!;
  const isSameDay = s.sameDay.includes(branch);
  const pool = isSameDay ? branch.commits : branch.commits.slice(0, 6);
  let picked = pool;
  if (pool.length > 1) {
    picked = unwrap(
      await p.multiselect({
        message: "Which commits does this entry cover?",
        required: false,
        initialValues: isSameDay ? pool.map((c) => c.sha) : [pool[0].sha],
        options: pool.map((c) => ({ value: c.sha, label: truncate(c.subject, 80), hint: dayjs(c.at).format("MMM D h:mma") })),
      }),
    ).map((sha) => pool.find((c) => c.sha === sha)!);
  }
  const tasks = [...new Set(picked.slice().reverse().map((c) => commitToTask(c.subject, branch.ticket)))];
  return { task: tasks.join("; ") || undefined, area: branch.area, span: s.span };
}

export async function gitListCommand(opts: { client?: string; days?: string; fetch?: boolean }): Promise<void> {
  const ctx = getCtx(opts.client);
  const cfg = ctx.client.git;
  if (!cfg?.repos.length) throw new ZynError(`No git repos set up for ${ctx.client.name}. Run "zyn git setup".`);
  const days = Number(opts.days ?? 14);
  if (opts.fetch !== false) {
    const spin = p.spinner();
    spin.start("Fetching");
    const r = await fetchStale(cfg, { force: true });
    spin.stop(r.failed.length ? chalk.yellow(`Couldn't fetch ${r.failed.join(", ")}; showing local branches`) : `Fetched ${r.fetched.join(", ") || "nothing"}`);
  }
  const since = today().subtract(days - 1, "day").format("YYYY-MM-DD");
  const commits = readCommits(cfg, since);
  const branches = groupBranches(commits);

  const loggedHours = new Map<string, number>();
  for (const m of new Set(commits.map((cm) => cm.day.slice(0, 7)))) {
    for (const e of loadMonth(ctx.key, m).entries) loggedHours.set(e.date, (loggedHours.get(e.date) ?? 0) + e.hours);
  }

  console.log(`\n  ${chalk.bold(ctx.client.name)} · your branches, last ${days} days ${c.dim(`(${cfg.repos.map(repoName).join(", ")})`)}\n`);
  if (!branches.length) {
    console.log(c.dim(`  No commits by ${cfg.authors.join(", ") || "anyone"} since ${shortDate(since)}.\n`));
    return;
  }
  for (const b of branches) {
    console.log(`  ${c.title(b.branch)}  ${c.dim(`${b.repo} · ${b.commits.length} commit${b.commits.length === 1 ? "" : "s"} · ${shortArea(b.area)}`)}`);
    for (const cm of b.commits.slice(0, 8)) {
      const logged = loggedHours.get(cm.day);
      const mark = logged ? chalk.green(`✓ ${formatHours(logged)}`) : chalk.hex("#F50991")("not logged");
      console.log(`    ${chalk.white(dayjs(cm.at).format("ddd MMM D h:mma").padEnd(18))} ${truncate(cm.subject, 70)}  ${mark}`);
    }
    if (b.commits.length > 8) console.log(c.dim(`    …and ${b.commits.length - 8} more`));
    console.log();
  }
  const unlogged = [...new Set(commits.map((cm) => cm.day))].filter((d) => !loggedHours.has(d)).sort();
  if (unlogged.length) console.log(chalk.hex("#F50991")(`  Days with commits but no hours: ${unlogged.map(shortDate).join(", ")}\n`));
}

export async function gitSetupCommand(opts: { client?: string; yes?: boolean }): Promise<void> {
  const ctx = getCtx(opts.client);
  if (opts.yes) {
    const cfg = ctx.client.git ?? defaultOnfireGit();
    if (!cfg) throw new ZynError("Couldn't find ~/Developer/spark-lms. Run \"zyn git setup\" without --yes to pick repos.");
    ctx.client.git = cfg;
    saveConfig(ctx.config);
    console.log(`${chalk.green("✔")} Git suggestions on for ${ctx.client.name}: ${cfg.repos.map(repoName).join(", ")}`);
    return;
  }

  p.intro(`Git suggestions · ${ctx.client.name}`);
  const existing = ctx.client.git ?? (ctx.key === "onfire" ? defaultOnfireGit() : undefined);
  const repoPaths = await askLines("Repo folders", existing?.repos.map((r) => r.path) ?? [], "~/Developer/spark-lms | ~/Developer/onfire-learning-app");
  for (const rp of repoPaths) if (!isGitRepo(rp)) throw new ZynError(`${rp} is not a git repo.`);

  const detected = repoPaths.flatMap(detectAuthors);
  const authors = await askLines("Author emails that count as you", [...new Set([...(existing?.authors ?? []), ...detected])]);

  const repos: GitRepo[] = [];
  for (const rp of repoPaths) {
    const prev = existing?.repos.find((r) => expandHome(r.path) === expandHome(rp));
    const name = prev?.name ?? path.basename(expandHome(rp));
    const areaChoices = ctx.client.areas.length ? ctx.client.areas : [name];
    const defaultArea = unwrap(
      await p.select({
        message: `${name}: default area`,
        initialValue: prev?.defaultArea && areaChoices.includes(prev.defaultArea) ? prev.defaultArea : areaChoices.find((a) => a.startsWith(name)) ?? areaChoices[0],
        options: areaChoices.map((a) => ({ value: a, label: a })),
      }),
    );
    const areaRules = [...(prev?.areaRules ?? [])];
    for (const rule of areaRules) p.log.message(c.dim(`${rule.paths.join(", ")} → ${rule.area}`));
    while (unwrap(await p.confirm({ message: `${name}: add a folder rule for another area?`, initialValue: false }))) {
      const area = unwrap(await p.select({ message: "Area", options: areaChoices.filter((a) => a !== defaultArea).map((a) => ({ value: a, label: a })) }));
      const paths = await askLines("Folder prefixes", [], "public/js/ | views/");
      if (paths.length) areaRules.push({ area, paths });
    }
    repos.push({ path: rp, name, defaultArea, areaRules });
  }

  const fetchEveryMinutes = Number(
    await askText({
      message: "Auto-fetch every N minutes (0 = always, blank = never)",
      initialValue: String(existing?.fetchEveryMinutes ?? 20),
      validate: (v) => (v === "" || Number(v) >= 0 ? undefined : "Number of minutes"),
    }) || -1,
  );
  ctx.client.git = { authors, repos, fetch: fetchEveryMinutes >= 0, fetchEveryMinutes: Math.max(0, fetchEveryMinutes) };
  saveConfig(ctx.config);
  p.outro(`Saved. "zyn log" will now suggest branches, and "zyn git" lists recent work.`);
}

export function gitCtxSession(ctx: Ctx): GitSession {
  return new GitSession(ctx.client.git);
}
