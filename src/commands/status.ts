import dayjs from "dayjs";
import { parseMonth } from "../lib/dates.ts";
import { totalHours } from "../lib/periods.ts";
import { listInvoices, loadMonth } from "../lib/store.ts";
import { renderDashboard } from "../ui/dashboard.ts";
import { getCtx } from "./context.ts";

export function statusCommand(monthArg: string | undefined, opts: { client?: string }): void {
  const ctx = getCtx(opts.client);
  const month = parseMonth(monthArg);
  const prevMonth = dayjs(`${month}-01`).subtract(1, "month").format("YYYY-MM");
  const invoice = listInvoices(ctx.key).filter((i) => i.month === month).at(-1);
  console.log(
    renderDashboard({
      client: ctx.client,
      month,
      entries: loadMonth(ctx.key, month).entries,
      prevMonthHours: totalHours(loadMonth(ctx.key, prevMonth).entries),
      invoiceNote: invoice ? `Invoiced #${invoice.number} on ${dayjs(invoice.date).format("MMM D")} for ${invoice.totalLabel}` : undefined,
    }),
  );
}
