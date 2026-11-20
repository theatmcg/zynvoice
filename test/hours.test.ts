import { test } from "node:test";
import assert from "node:assert/strict";
import dayjs from "dayjs";
import { parseTime } from "../src/lib/hours.ts";
import { parseDate, parseMonth, longDate } from "../src/lib/dates.ts";

test("time ranges", () => {
  assert.deepEqual(parseTime("10:30am-11:45am"), { hours: 1.25, start: "10:30am", end: "11:45am" });
  assert.deepEqual(parseTime("6:25pm-7:26"), { hours: 1.02, start: "6:25pm", end: "7:26pm" });
  assert.deepEqual(parseTime("9-11:30pm"), { hours: 2.5, start: "9:00pm", end: "11:30pm" });
  assert.deepEqual(parseTime("9-5pm"), { hours: 8, start: "9:00am", end: "5:00pm" });
  assert.deepEqual(parseTime("11-1"), { hours: 2, start: "11:00am", end: "1:00pm" });
  assert.equal(parseTime("11:30am-12:30am")?.hours, 1);
  assert.equal(parseTime("10am to 12pm")?.hours, 2);
});

test("durations", () => {
  assert.deepEqual(parseTime("1.5"), { hours: 1.5 });
  assert.deepEqual(parseTime("2h"), { hours: 2 });
  assert.deepEqual(parseTime("1h15m"), { hours: 1.25 });
  assert.deepEqual(parseTime("90m"), { hours: 1.5 });
  assert.deepEqual(parseTime("45 min"), { hours: 0.75 });
  assert.deepEqual(parseTime("1:30"), { hours: 1.5 });
});

test("rejects nonsense", () => {
  for (const bad of ["", "abc", "0", "25", "13pm-2pm", "10:75am-11am"]) assert.equal(parseTime(bad), null, bad);
});

test("dates", () => {
  const now = dayjs("2026-11-20");
  assert.equal(parseDate("", now), "2026-11-20");
  assert.equal(parseDate("yesterday", now), "2026-11-19");
  assert.equal(parseDate("11/3", now), "2026-11-03");
  assert.equal(parseDate("10/31/2026", now), "2026-10-31");
  assert.equal(parseDate("2026-11-05", now), "2026-11-05");
  assert.equal(parseDate("7", now), "2026-11-07");
  assert.equal(parseDate("mon", now), "2026-11-16");
  assert.equal(parseDate("fri", now), "2026-11-20");
  assert.equal(parseDate("2/30", now), null);
});

test("months", () => {
  const now = dayjs("2026-11-20");
  assert.equal(parseMonth(undefined, now), "2026-11");
  assert.equal(parseMonth("last", now), "2026-10");
  assert.equal(parseMonth("oct", now), "2026-10");
  assert.equal(parseMonth("9", now), "2026-09");
  assert.equal(parseMonth("2025-12", now), "2025-12");
  assert.equal(longDate("2026-11-01"), "November 1st, 2026");
  assert.equal(longDate("2026-11-22"), "November 22nd, 2026");
  assert.equal(longDate("2026-11-13"), "November 13th, 2026");
});
