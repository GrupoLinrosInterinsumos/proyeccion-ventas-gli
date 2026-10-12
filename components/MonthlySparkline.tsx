import { formatQty } from "@/lib/format";
import { periodLabel } from "@/lib/period";
import type { Unit } from "@/lib/units";

const BAR = 5;
const GAP = 2;
const HEIGHT = 26;

/**
 * Tiny bar chart of monthly sales to spot peaks at a glance. Bars of the months that feed the
 * 3-month average are darker; the single highest month is red. Hover a bar for its month and
 * quantity.
 */
export default function MonthlySparkline({
  values,
  months,
  unit,
  averageWindow = 3,
}: {
  values: number[];
  months: string[];
  unit: Unit;
  averageWindow?: number;
}) {
  const max = Math.max(0, ...values);
  if (values.length === 0 || max <= 0) {
    return <span className="text-label-sm text-on-surface-variant">—</span>;
  }
  const peak = values.indexOf(max);
  const width = values.length * (BAR + GAP) - GAP;

  return (
    <svg
      width={width}
      height={HEIGHT}
      viewBox={`0 0 ${width} ${HEIGHT}`}
      role="img"
      aria-label="Ventas mensuales de los últimos meses"
      className="block"
    >
      {values.map((v, i) => {
        const h = v > 0 ? Math.max(2, (v / max) * (HEIGHT - 2)) : 1;
        const inWindow = i >= values.length - averageWindow;
        return (
          <rect
            key={months[i] ?? i}
            x={i * (BAR + GAP)}
            y={HEIGHT - h}
            width={BAR}
            height={h}
            rx={1}
            className={i === peak ? "fill-secondary" : inWindow ? "fill-primary" : "fill-outline-variant"}
          >
            <title>{`${months[i] ? periodLabel(months[i]) : ""}: ${formatQty(v)} ${unit}${i === peak ? " (pico)" : ""}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
