const numberFormatter = new Intl.NumberFormat("es-PE", {
  maximumFractionDigits: 0,
});

const usdFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usdFormatterCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatQty(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return numberFormatter.format(Math.round(value));
}

/** Everything in this system is denominated in USD, regardless of what the source Excel column says. */
export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return usdFormatter.format(value);
}

/** Same as formatUsd but without cents — for large aggregate totals (dashboard KPIs). */
export function formatUsdCompact(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return usdFormatterCompact.format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value > 0 && value < 1) return "<1%";
  return `${Math.round(value)}%`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}
