import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import dayjs from "dayjs";
import { paths, writeJson } from "./store.ts";
import type { GitConfig, GitRepo } from "./schema.ts";

export interface GitCommit {
  repo: string;
  sha: string;
  /** Author date: when the work was done, unlike the committer date which rebases rewrite. */
  at: string;
  day: string;
  email: string;
  name: string;
  branch: string;
  subject: string;
  files: string[];
  area?: string;
}

export interface BranchSuggestion {
  repo: string;
  branch: string;
  ticket?: string;
  commits: GitCommit[];
  area?: string;
  lastDay: string;
}

export function expandHome(p: string): string {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}

export function repoName(repo: GitRepo): string {
  return repo.name ?? path.basename(expandHome(repo.path));
}

function git(repoPath: string, args: string[]): string {
  return execFileSync("git", ["-C", expandHome(repoPath), ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
}

export function isGitRepo(p: string): boolean {
  try {
    return git(p, ["rev-parse", "--is-inside-work-tree"]).trim() === "true";
  } catch {
    return false;
  }
}

/** Emails of commits made in this clone (from the reflog), plus the repo's configured user.email. */
export function detectAuthors(repoPath: string): string[] {
  const emails = new Set<string>();
  try {
    for (const line of git(repoPath, ["reflog", "--format=%gs%x1f%ae"]).split("\n")) {
      const [action, email] = line.split("\x1f");
      if (email && /^commit/.test(action)) emails.add(email.toLowerCase());
    }
  } catch {
    // empty reflog
  }
  try {
    const own = git(repoPath, ["config", "user.email"]).trim();
    if (own) emails.add(own.toLowerCase());
  } catch {
    // no user.email
  }
  return [...emails];
}

function readFetchCache(): Record<string, number> {
  try {
    return JSON.parse(fs.readFileSync(paths.gitCache(), "utf8"));
  } catch {
    return {};
  }
}

function fetchRepo(repoPath: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["-C", expandHome(repoPath), "fetch", "--all", "--prune", "--quiet"],
      {
        timeout: timeoutMs,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? "ssh -oBatchMode=yes" },
      },
      (err) => resolve(!err),
    );
  });
}

/** Fetches repos that haven't been fetched recently. Never throws; offline just means stale suggestions. */
export async function fetchStale(cfg: GitConfig, opts: { force?: boolean; timeoutMs?: number } = {}): Promise<{ fetched: string[]; failed: string[] }> {
  const result = { fetched: [] as string[], failed: [] as string[] };
  if (!cfg.fetch && !opts.force) return result;
  const cache = readFetchCache();
  const now = Date.now();
  const stale = cfg.repos.filter((r) => opts.force || now - (cache[expandHome(r.path)] ?? 0) > cfg.fetchEveryMinutes * 60_000);
  await Promise.all(
    stale.map(async (r) => {
      const ok = await fetchRepo(r.path, opts.timeoutMs ?? 15_000);
      (ok ? result.fetched : result.failed).push(repoName(r));
      if (ok) cache[expandHome(r.path)] = now;
    }),
  );
  if (result.fetched.length) writeJson(paths.gitCache(), cache);
  return result;
}

function cleanBranch(ref: string): string {
  return ref
    .replace(/^refs\/heads\//, "")
    .replace(/^refs\/remotes\/[^/]+\//, "")
    .replace(/^refs\/tags\//, "tag:");
}

export function matchesAuthor(authors: string[], email: string, name: string): boolean {
  if (!authors.length) return true;
  const e = email.toLowerCase();
  const n = name.toLowerCase();
  return authors.some((a) => {
    const q = a.toLowerCase().trim();
    return q.includes("@") ? e === q : n.includes(q);
  });
}

export function guessArea(repo: GitRepo, files: string[]): string | undefined {
  if (!files.length) return repo.defaultArea;
  let best: { area: string; count: number } | undefined;
  for (const rule of repo.areaRules) {
    const count = files.filter((f) => rule.paths.some((p) => f.startsWith(p))).length;
    if (count > files.length / 2 && (!best || count > best.count)) best = { area: rule.area, count };
  }
  return best?.area ?? repo.defaultArea;
}

/** Your non-merge commits on any branch with an author date on or after `sinceDay`. */
export function readCommits(cfg: GitConfig, sinceDay: string): GitCommit[] {
  const commits: GitCommit[] = [];
  // --since filters on committer date, which is always >= author date, so this is a superset.
  const since = dayjs(sinceDay).startOf("day").toISOString();
  for (const repo of cfg.repos) {
    if (!isGitRepo(repo.path)) continue;
    let out: string;
    try {
      out = git(repo.path, [
        "log",
        "--all",
        "--no-merges",
        "--source",
        `--since=${since}`,
        "--format=%x1e%H%x1f%aI%x1f%ae%x1f%an%x1f%S%x1f%s",
        "--name-only",
      ]);
    } catch {
      continue;
    }
    for (const record of out.split("\x1e")) {
      if (!record.trim()) continue;
      const [header, ...rest] = record.split("\n");
      const [sha, at, email, name, source, subject] = header.split("\x1f");
      if (!sha || !matchesAuthor(cfg.authors, email, name)) continue;
      if (source === "refs/stash") continue;
      const day = dayjs(at).format("YYYY-MM-DD");
      if (day < sinceDay) continue;
      const files = rest.map((f) => f.trim()).filter(Boolean);
      commits.push({
        repo: repoName(repo),
        sha,
        at,
        day,
        email,
        name,
        branch: cleanBranch(source),
        subject,
        files,
        area: guessArea(repo, files),
      });
    }
  }
  return commits.sort((a, b) => b.at.localeCompare(a.at));
}

const TICKET = /\b([A-Z][A-Z0-9]+-\d+)\b/;

export function ticketOf(text: string): string | undefined {
  return text.toUpperCase().match(TICKET)?.[1];
}

/** "OLMS-267 Add bulk outline" -> "Add bulk outline (OLMS-267)"; adds the branch ticket if missing. */
export function commitToTask(subject: string, branchTicket?: string): string {
  let s = subject.trim();
  const lead = s.match(/^\[?([A-Z][A-Z0-9]+-\d+)\]?[:\s-]+(.*)$/);
  let ticket = branchTicket;
  if (lead) {
    ticket = lead[1];
    s = lead[2].trim();
  }
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (ticket && !s.toUpperCase().includes(ticket)) s = `${s} (${ticket})`;
  return s;
}

export function groupBranches(commits: GitCommit[]): BranchSuggestion[] {
  const map = new Map<string, BranchSuggestion>();
  for (const c of commits) {
    const key = `${c.repo}\0${c.branch}`;
    let s = map.get(key);
    if (!s) {
      s = { repo: c.repo, branch: c.branch, ticket: ticketOf(c.branch), commits: [], lastDay: c.day };
      map.set(key, s);
    }
    s.commits.push(c);
    if (c.day > s.lastDay) s.lastDay = c.day;
    s.ticket ??= ticketOf(c.subject);
  }
  for (const s of map.values()) {
    const votes = new Map<string, number>();
    for (const c of s.commits) if (c.area) votes.set(c.area, (votes.get(c.area) ?? 0) + Math.max(1, c.files.length));
    s.area = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  }
  return [...map.values()].sort((a, b) => b.lastDay.localeCompare(a.lastDay) || b.commits.length - a.commits.length);
}

export interface DaySuggestions {
  /** Branches with commits on the day itself. */
  sameDay: BranchSuggestion[];
  /** Other branches you touched in the days before. */
  recent: BranchSuggestion[];
  /** "10:32am-1:15pm" span of that day's commits. */
  span?: string;
}

export function suggestionsFor(commits: GitCommit[], day: string, lookbackDays = 7): DaySuggestions {
  const from = dayjs(day).subtract(lookbackDays, "day").format("YYYY-MM-DD");
  const onDay = commits.filter((c) => c.day === day);
  const sameDay = groupBranches(onDay);
  const seen = new Set(sameDay.map((s) => `${s.repo}\0${s.branch}`));
  const recent = groupBranches(commits.filter((c) => c.day >= from && c.day < day)).filter((s) => !seen.has(`${s.repo}\0${s.branch}`));

  let span: string | undefined;
  if (onDay.length) {
    const times = onDay.map((c) => dayjs(c.at)).sort((a, b) => a.valueOf() - b.valueOf());
    const fmt = (d: dayjs.Dayjs) => d.format("h:mma");
    span = times.length > 1 ? `${fmt(times[0])}-${fmt(times[times.length - 1])}` : fmt(times[0]);
  }
  return { sameDay, recent: recent.slice(0, 6), span };
}
