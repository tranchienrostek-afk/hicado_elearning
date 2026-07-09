// Attendance dates are persisted at UTC midnight (`new Date("YYYY-MM-DD")`).
// Billing-period boundaries must therefore be computed in UTC — using local
// setHours() shifts the window by the server's timezone offset and drops or
// double-counts sessions on the first/last day of a period.

export function startOfDayUTC(input: string | Date): Date {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${input}`);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function endOfDayUTC(input: string | Date): Date {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${input}`);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

export function parsePeriod(fromDate?: string | Date | null, toDate?: string | Date | null): { from: Date | null; to: Date | null } {
  const from = fromDate ? startOfDayUTC(fromDate) : null;
  const to = toDate ? endOfDayUTC(toDate) : null;
  return { from, to };
}

// month is 1-based ("2026-05" -> year=2026, month=5)
export function monthRangeUTC(year: number, month: number): { from: Date; to: Date } {
  return {
    from: new Date(Date.UTC(year, month - 1, 1)),
    to: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
  };
}
