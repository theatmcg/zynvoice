const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function money(n: number): string {
  return usd.format(Math.round(n * 100) / 100);
}

/** "$55/hr", or "$55.50/hr" when the rate has cents. */
export function rateLabel(rate: number): string {
  return Number.isInteger(rate) ? `$${rate}/hr` : `${money(rate)}/hr`;
}

/** Qty as printed on the invoice: whole numbers stay whole, otherwise up to 2 decimals. */
export function qty(n: number): string {
  return String(Number((Math.round(n * 100) / 100).toFixed(2)));
}
