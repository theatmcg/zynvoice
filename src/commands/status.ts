import chalk from "chalk";
import dayjs from "dayjs";
import { parseMonth } from "../lib/dates.ts";
import { money } from "../lib/money.ts";
import { totalHours } from "../lib/periods.ts";
import { listInvoices, loadConfig, loadMonth, saveConfig, ZynError } from "../lib/store.ts";
import { renderBody, renderHeader, type DashboardInput } from "../ui/dashboard.ts";
import { animateInPlace } from "../ui/slot.ts";
import { visibleWidth } from "../ui/theme.ts";
import { getCtx } from "./context.ts";

interface StatusOpts {
  client?: string;
  salary?: boolean;
  anim?: boolean;
}

function resolveSalary(configured: number | undefined, opt: StatusOpts["salary"]): number | undefined {
  if (opt === undefined || opt === false) return undefined;
  if (opt === true) {
    if (configured === undefined) throw new ZynError(`No salary set. Run "zyn salary 6000" first.`);
    return configured;
  }
  return undefined;
}

export async function statusCommand(monthArg: string | undefined, opts: StatusOpts): Promise<void> {
  const ctx = getCtx(opts.client);
  const month = parseMonth(monthArg);
  const prevMonth = dayjs(`${month}-01`).subtract(1, "month").format("YYYY-MM");
  const invoice = listInvoices(ctx.key).filter((i) => i.month === month).at(-1);
  const input: DashboardInput = {
    client: ctx.client,
    month,
    entries: loadMonth(ctx.key, month).entries,
    prevMonthHours: totalHours(loadMonth(ctx.key, prevMonth).entries),
    invoiceNote: invoice ? `Invoiced #${invoice.number} on ${dayjs(invoice.date).format("MMM D")} for ${invoice.totalLabel}` : undefined,
    salary: resolveSalary(ctx.config.salary, opts.salary),
    display: ctx.config.display,
  };

  const header = renderHeader(input);
  const width = Math.max(...header.split("\n").map(visibleWidth));
  const canAnimate =
    opts.anim !== false &&
    ctx.config.display.animate &&
    process.stdout.isTTY &&
    !process.env.CI &&
    (process.stdout.columns ?? 0) > width &&
    input.entries.length + (input.salary ?? 0) > 0;

  console.log();
  if (canAnimate) await animateInPlace((t) => renderHeader(input, t));
  else console.log(header);
  console.log(renderBody(input));
}

export function salaryCommand(amount: string | undefined): void {
  const config = loadConfig();
  if (amount === undefined) {
    console.log(config.salary === undefined ? 'No salary set. Set one with "zyn salary 6000".' : `Monthly salary: ${chalk.greenBright.bold(money(config.salary))}`);
    return;
  }
  const n = Number(amount.replace(/[$,]/g, ""));
  if (!Number.isFinite(n) || n < 0) throw new ZynError(`Invalid salary "${amount}".`);
  config.salary = n;
  saveConfig(config);
  console.log(`${chalk.green("✔")} Monthly salary set to ${chalk.greenBright.bold(money(n))}. Show it with "zyn -s".`);
}
