import dayjs from "dayjs";
import { longDate } from "./dates.ts";
import { roundHours } from "./hours.ts";
import { money, qty } from "./money.ts";
import { summarizePeriods, type PeriodSummary } from "./periods.ts";
import type { InvoiceView } from "./render.ts";
import type { Client, Entry, Profile } from "./schema.ts";

export interface InvoiceOptions {
  number: number;
  /** YYYY-MM-DD */
  date: string;
  /** YYYY-MM-DD, or null to print "--". */
  due: string | null;
  adjustments: number;
  titles: Record<string, string>;
}

export interface BuiltInvoice {
  view: InvoiceView;
  periods: PeriodSummary[];
  hours: number;
  subtotal: number;
  total: number;
}

export function buildInvoice(client: Client, profile: Profile, month: string, entries: Entry[], opts: InvoiceOptions): BuiltInvoice {
  const periods = summarizePeriods(month, entries, client.periodSplits, client.areas).filter((p) => p.entries.length);
  const hours = roundHours(periods.reduce((s, p) => s + p.hours, 0));
  const subtotal = periods.reduce((s, p) => s + Math.round(p.hours * client.rate * 100) / 100, 0);
  const total = subtotal + opts.adjustments;

  const view: InvoiceView = {
    sender: {
      name: profile.name,
      address: profile.address,
      phone: profile.phone,
      email: profile.email,
      paymentNotes: profile.paymentNotes,
    },
    billTo: client.billTo,
    project: client.project,
    number: String(opts.number),
    dateLabel: longDate(opts.date),
    dueLabel: opts.due ? longDate(opts.due) : "--",
    totals: {
      qty: qty(hours),
      subtotal: money(subtotal),
      adjustments: money(opts.adjustments),
      total: money(total),
    },
    items: periods.map((p) => {
      const title = opts.titles[p.key]?.trim();
      return {
        title: title ? `${p.label}: ${title}` : p.label,
        groups: p.groups,
        qty: qty(p.hours),
        unitPrice: money(client.rate),
        total: money(p.hours * client.rate),
      };
    }),
  };
  return { view, periods, hours, subtotal, total };
}

/** "OnFire-Learning-Oct-31-2026-invoice-54370.pdf" */
export function invoiceFileName(client: Client, month: string, number: number): string {
  const end = dayjs(`${month}-01`).endOf("month");
  return `${client.filePrefix}-${end.format("MMM-D-YYYY")}-invoice-${number}.pdf`;
}

/** Default invoice date: the 1st of the following month, like the reference invoice. */
export function defaultInvoiceDate(month: string): string {
  return dayjs(`${month}-01`).add(1, "month").format("YYYY-MM-DD");
}
