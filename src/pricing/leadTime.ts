// Lead-time engine (§7.2). Business days skip Sat/Sun; no holiday calendar in v1.

export interface LeadTimeInput {
  blankT: number;
  maxLineQty: number;
  dfars: boolean;
  quoteDate: string; // ISO YYYY-MM-DD
}

export function computeLeadTime(input: LeadTimeInput): {
  days: number;
  contributors: string[];
  shipDate: string;
} {
  let days = 2;
  const contributors = ["base: 2 business days"];
  if (input.blankT > 4.0) {
    days += 1;
    contributors.push(`thickness ${input.blankT}" > 4": +1 day`);
  }
  if (input.maxLineQty > 10) {
    days += 1;
    contributors.push(`qty ${input.maxLineQty} > 10: +1 day`);
  }
  if (input.dfars) {
    days += 2;
    contributors.push("DFARS sourcing: +2 days");
  }
  return { days, contributors, shipDate: addBusinessDays(input.quoteDate, days) };
}

function parseISO(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addBusinessDays(date: string, days: number): string {
  const d = parseISO(date);
  let remaining = days;
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) remaining -= 1;
  }
  return toISO(d);
}

export function addCalendarDays(date: string, days: number): string {
  const d = parseISO(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}
