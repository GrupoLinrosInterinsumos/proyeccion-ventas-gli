import { formatQty } from "@/lib/format";
import { periodLabel } from "@/lib/period";
import type { Unit } from "@/lib/units";

const BAR = 16;
const GAP = 6;
const CHART_HEIGHT = 24;
const LABEL_HEIGHT = 11;

/**
 * Tiny bar chart of the monthly sales that feed the 3-month average, to spot a peak at a glance:
 * the single highest month is red. Month initials sit under the bars; hover a bar for the month
 * and the exact quantity.
 */
export default function MonthlySparkline({
  values,
  months,
  unit,
}: {
  values: number[];
  months: string[];
  unit: Unit;
}) {
  const max = Math.max(0, ...values);
  if (values.length === 0 || max <= 0) {
    return <span className="text-label-sm text-on-surface-variant">—</span>;
  }
  const peak = values.indexOf(max);
  const width = values.length * (BAR + GAP) - GAP;
  const height = CHART_HEIGHT + LABEL_HEIGHT;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Ventas de cada uno de los últimos 3 meses"
      className="block"
    >
      {values.map((v, i) => {
        const h = v > 0 ? Math.max(2, (v / max) * (CHART_HEIGHT - 2)) : 1;
        const x = i * (BAR + GAP);
        const month = months[i] ? periodLabel(months[i]) : "";
        return (
          <g key={months[i] ?? i}>
            <rect
              x={x}
              y={CHART_HEIGHT - h}
              width={BAR}
              height={h}
              rx={1.5}
              className={i === peak ? "fill-secondary" : "fill-primary"}
            >
              <title>{`${month}: ${formatQty(v)} ${unit}${i === peak ? " (pico)" : ""}`}</title>
            </rect>
            <text
              x={x + BAR / 2}
              y={height - 1}
              textAnchor="middle"
              fontSize="9"
              className="fill-on-surface-variant"
            >
              {month.slice(0, 3)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
