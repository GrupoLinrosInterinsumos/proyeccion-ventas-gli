const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const LIMA_OFFSET_MS = 5 * 60 * 60 * 1000; // America/Lima is UTC-5, no DST

/** A Date whose UTC getters read as Lima wall-clock time, regardless of server timezone. */
function limaNow(now = new Date()): Date {
  return new Date(now.getTime() - LIMA_OFFSET_MS);
}

export function periodKey(year: number, month1to12: number): string {
  return `${year}-${String(month1to12).padStart(2, "0")}`;
}

export function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function addMonths(year: number, month1to12: number, delta: number): { year: number; month: number } {
  const zeroBased = year * 12 + (month1to12 - 1) + delta;
  return { year: Math.floor(zeroBased / 12), month: (((zeroBased % 12) + 12) % 12) + 1 };
}

/**
 * The 3 most recent *closed* (fully finished) calendar months before the given reference
 * month, ordered oldest -> newest. If reference is 2026-08, returns
 * ["2026-05","2026-06","2026-07"].
 */
export function lastClosedMonths(count = 3, now = new Date()): string[] {
  const lima = limaNow(now);
  const result: string[] = [];
  let y = lima.getUTCFullYear();
  let m = lima.getUTCMonth() + 1;
  for (let i = 0; i < count; i++) {
    ({ year: y, month: m } = addMonths(y, m, -1));
    result.unshift(periodKey(y, m));
  }
  return result;
}

/** @deprecated kept for scripts/reporting that just want "today's" calendar month, not a projection period. */
export function currentProjectionPeriod(now = new Date()): string {
  const lima = limaNow(now);
  return periodKey(lima.getUTCFullYear(), lima.getUTCMonth() + 1);
}

/**
 * Hour (Lima time, 0–23) at which a projection closes on the last day of its working month.
 * 19 by default; set the CIERRE_HORA environment variable (e.g. 13) to move it.
 */
export function cierreHora(): number {
  const raw = process.env.CIERRE_HORA?.trim();
  if (!raw) return 19;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : 19;
}

/** The closing hour as shown to people: "7pm", "1pm", "10am". */
export function cierreHoraLabel(): string {
  const h = cierreHora();
  return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;
}

/**
 * A projection period is worked on during the calendar month *before* it, closing the last
 * day of that month at `cierreHora()` Lima time (19:00 unless CIERRE_HORA says otherwise). E.g.
 * October's projection is open all of September, closing Sep 30 19:00 — November's opens
 * immediately after.
 */
export function openProjectionPeriod(now = new Date()): string {
  const lima = limaNow(now);
  const y = lima.getUTCFullYear();
  const m = lima.getUTCMonth() + 1;
  const d = lima.getUTCDate();
  const h = lima.getUTCHours();

  const nextDay = new Date(Date.UTC(y, m - 1, d + 1));
  const rolledIntoNextMonth = nextDay.getUTCMonth() !== m - 1;
  const pastCutoff = rolledIntoNextMonth && h >= cierreHora();

  const monthsAhead = pastCutoff ? 2 : 1;
  const { year, month } = addMonths(y, m, monthsAhead);
  return periodKey(year, month);
}

/** The calendar month during which `period`'s projection is being worked on (period minus 1 month). */
export function workingMonthDate(period: string): Date {
  const [y, m] = period.split("-").map(Number);
  const { year, month } = addMonths(y, m, -1);
  // Anchor mid-month in UTC so it round-trips through limaNow()'s UTC getters unambiguously.
  return new Date(Date.UTC(year, month - 1, 15, 12));
}

/** The 3-closed-month average window that applied when `period` was open for editing. */
export function closedMonthsForPeriod(period: string, count = 3): string[] {
  return lastClosedMonths(count, workingMonthDate(period));
}

export type PeriodStatus = "open" | "closed" | "future";

export function periodStatus(period: string, now = new Date()): PeriodStatus {
  const open = openProjectionPeriod(now);
  if (period === open) return "open";
  return period < open ? "closed" : "future";
}

/** Periods to show on the home screen: the open one plus `pastCount` closed ones, newest first. */
export function listRecentPeriods(pastCount = 6, now = new Date()): { period: string; status: PeriodStatus }[] {
  const open = openProjectionPeriod(now);
  const [oy, om] = open.split("-").map(Number);
  const result: { period: string; status: PeriodStatus }[] = [{ period: open, status: "open" }];
  for (let i = 1; i <= pastCount; i++) {
    const { year, month } = addMonths(oy, om, -i);
    result.push({ period: periodKey(year, month), status: "closed" });
  }
  return result;
}
