const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function periodKey(year: number, month1to12: number): string {
  return `${year}-${String(month1to12).padStart(2, "0")}`;
}

export function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** Current projection target period (the open month being projected), e.g. 2026-08. */
export function currentProjectionPeriod(now = new Date()): string {
  return periodKey(now.getFullYear(), now.getMonth() + 1);
}

/**
 * The 3 most recent *closed* (fully finished) calendar months before the current one,
 * ordered oldest -> newest. If today is 2026-08-24, returns ["2026-05","2026-06","2026-07"].
 */
export function lastClosedMonths(count = 3, now = new Date()): string[] {
  const result: string[] = [];
  let y = now.getFullYear();
  let m = now.getMonth() + 1; // 1-12, current month
  for (let i = 0; i < count; i++) {
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
    result.unshift(periodKey(y, m));
  }
  return result;
}
