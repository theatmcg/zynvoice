import { test } from "node:test";
import assert from "node:assert/strict";
import { commitToTask, groupBranches, guessArea, matchesAuthor, suggestionsFor, type GitCommit } from "../src/lib/git.ts";

test("commit subjects become invoice-style tasks", () => {
  assert.equal(commitToTask("OLMS-267 Add bulk outline endpoint"), "Add bulk outline endpoint (OLMS-267)");
  assert.equal(commitToTask("[OLMS-12]: fix login"), "Fix login (OLMS-12)");
  assert.equal(commitToTask("Fix audio layout (OLMS-268)", "OLMS-268"), "Fix audio layout (OLMS-268)");
  assert.equal(commitToTask("Show course labels", "OLMS-300"), "Show course labels (OLMS-300)");
  assert.equal(commitToTask("Show course labels"), "Show course labels");
});

test("authors match by exact email or name substring", () => {
  assert.ok(matchesAuthor(["chris@onesource.host"], "Chris@OneSource.host", "Chris"));
  assert.ok(!matchesAuthor(["chris@onesource.host"], "eric@x.com", "eyunker"));
  assert.ok(matchesAuthor(["mcguire"], "a@b.c", "Chris McGuire"));
  assert.ok(matchesAuthor([], "anyone@x.com", "Anyone"));
});

test("folder rules pick the area", () => {
  const repo = {
    path: "x",
    defaultArea: "Backend",
    areaRules: [{ area: "Web", paths: ["public/js/", "views/"] }],
  };
  assert.equal(guessArea(repo, ["public/js/a.js", "views/b.php", "models/c.php"]), "Web");
  assert.equal(guessArea(repo, ["models/c.php", "views/b.php"]), "Backend");
  assert.equal(guessArea(repo, []), "Backend");
});

const commit = (branch: string, at: string, subject: string, area = "Backend"): GitCommit => ({
  repo: "spark-lms",
  sha: `${branch}-${at}`,
  at,
  day: at.slice(0, 10),
  email: "me@x.com",
  name: "Me",
  branch,
  subject,
  files: ["a"],
  area,
});

test("suggestions split same-day branches from recent ones", () => {
  const commits = [
    commit("feature/olms-267-bulk", "2026-11-16T12:21:00-07:00", "OLMS-267 Panel"),
    commit("feature/olms-267-bulk", "2026-11-16T11:43:00-07:00", "OLMS-267 Endpoint"),
    commit("fix/olms-268-audio", "2026-11-13T09:00:00-07:00", "Audio", "Web"),
    commit("old/branch", "2026-11-01T09:00:00-07:00", "Too old"),
  ];
  const s = suggestionsFor(commits, "2026-11-16");
  assert.deepEqual(s.sameDay.map((b) => b.branch), ["feature/olms-267-bulk"]);
  assert.equal(s.sameDay[0].ticket, "OLMS-267");
  assert.deepEqual(s.recent.map((b) => b.branch), ["fix/olms-268-audio"]);
  assert.equal(s.recent[0].area, "Web");
  assert.equal(s.span, "11:43am-12:21pm");
  assert.equal(groupBranches(commits).length, 3);
});
