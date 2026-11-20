import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DEFAULT_ONFIRE, ONESOURCE_PROFILE } from "../src/commands/init.ts";
import { matchArea } from "../src/commands/context.ts";
import { buildInvoice, invoiceFileName } from "../src/lib/invoice.ts";
import { buildPeriods, groupByArea } from "../src/lib/periods.ts";
import { MonthLogSchema } from "../src/lib/schema.ts";

const october = MonthLogSchema.parse(JSON.parse(fs.readFileSync(new URL("./fixtures/october-2026.json", import.meta.url), "utf8")));

test("periods follow the client's splits", () => {
  assert.deepEqual(
    buildPeriods("2026-10", [10, 20]).map((p) => p.label),
    ["Oct 1-10", "Oct 11-20", "Oct 21-31"],
  );
  assert.deepEqual(
    buildPeriods("2026-02", [10, 20]).map((p) => p.key),
    ["1-10", "11-20", "21-28"],
  );
  assert.deepEqual(
    buildPeriods("2026-11", []).map((p) => p.label),
    ["Nov 1-30"],
  );
});

test("tasks group by area in configured order and drop duplicates", () => {
  const e = (area: string, task: string) => ({ id: task, date: "2026-11-01", hours: 1, area, task });
  const groups = groupByArea([e("web", "A"), e("api", "B"), e("web", "a "), e("web", "C")], ["api", "web"]);
  assert.deepEqual(groups, [
    { area: "api", tasks: ["B"] },
    { area: "web", tasks: ["A", "C"] },
  ]);
});

test("October fixture reproduces the reference invoice totals", () => {
  const client = { ...DEFAULT_ONFIRE, profile: "onesource", rate: 75 };
  const built = buildInvoice(client, ONESOURCE_PROFILE, "2026-10", october.entries, {
    number: 54370,
    date: "2026-11-01",
    due: null,
    adjustments: 0,
    titles: october.periodTitles,
  });
  assert.equal(built.hours, 173);
  assert.equal(built.view.totals.total, "$12,975.00");
  assert.equal(built.view.dateLabel, "November 1st, 2026");
  assert.equal(built.view.dueLabel, "--");
  assert.deepEqual(
    built.view.items.map((i) => [i.title.split(":")[0], i.qty, i.total]),
    [
      ["Oct 1-10", "35", "$2,625.00"],
      ["Oct 11-20", "88", "$6,600.00"],
      ["Oct 21-31", "50", "$3,750.00"],
    ],
  );
  assert.equal(built.view.items[0].groups.length, 3);
  assert.equal(invoiceFileName(client, "2026-10", 54370), "OnFire-Learning-Oct-31-2026-invoice-54370.pdf");
});

test("area shorthand", () => {
  const areas = DEFAULT_ONFIRE.areas;
  assert.equal(matchArea(areas, "backend"), "spark-lms (Backend / Mobile Backend)");
  assert.equal(matchArea(areas, "web"), "spark-lms (Web Frontend)");
  assert.equal(matchArea(areas, "mobile"), "onfire-learning-app (Mobile)");
  assert.equal(matchArea(areas, "Brand new area"), "Brand new area");
  assert.throws(() => matchArea(areas, "spark"));
});
