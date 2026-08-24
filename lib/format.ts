const numberFormatter = new Intl.NumberFormat("es-PE", {
  maximumFractionDigits: 0,
});

export function formatQty(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return numberFormatter.format(Math.round(value));
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
