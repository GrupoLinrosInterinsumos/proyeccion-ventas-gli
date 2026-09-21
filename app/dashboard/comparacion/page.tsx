import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getPeriodComparisonBreakdown, type PeriodComparisonRow } from "@/lib/sales";
import { openProjectionPeriod, closedMonthsForPeriod, periodStatus, periodLabel, listRecentPeriods } from "@/lib/period";
import { isRegion, REGION_LABELS, type Region } from "@/lib/regions";
import { formatQty, formatQtySplit, formatUsd } from "@/lib/format";
import { addQty, emptyQty, isExcedido, qtyDelta } from "@/lib/units";
import TopNav from "@/components/TopNav";
import UnitTag from "@/components/UnitTag";

function sumRows(rows: PeriodComparisonRow[]) {
  const proyectado = emptyQty();
  const real = emptyQty();
  let proyectadoUsd = 0;
  let realUsd = 0;
  for (const r of rows) {
    addQty(proyectado, r.unidad, r.proyectado);
    addQty(real, r.unidad, r.real);
    proyectadoUsd += r.proyectado_usd;
    realUsd += r.real_usd;
  }
  return { proyectado, real, proyectadoUsd, realUsd };
}

function changePct(proyectado: number, real: number): number | null {
  return proyectado > 0 ? ((real - proyectado) / proyectado) * 100 : null;
}

export default async function ComparacionPage({
  searchParams,
}: {
  searchParams: Promise<{
    region?: string;
    vendedor?: string;
    categoriaN2?: string;
    period?: string;
    targetPeriod?: string;
  }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const isAdmin = session.isAdmin;

  const open = openProjectionPeriod();
  const contextPeriod = periodStatus(params.period?.trim() || open) === "future" ? open : params.period?.trim() || open;
  const defaultTarget = closedMonthsForPeriod(contextPeriod).slice(-1)[0];
  const requestedTarget = params.targetPeriod?.trim();
  const targetPeriod = requestedTarget && periodStatus(requestedTarget) === "closed" ? requestedTarget : defaultTarget;

  const region: Region | "" = isAdmin ? (isRegion(params.region) ? params.region : "") : session.region ?? "";
  const vendedor = isAdmin ? params.vendedor?.trim() || "" : session.vendedor ?? "";
  const categoriaN2 = isAdmin ? params.categoriaN2?.trim() || "" : "";

  const filters = {
    region: region || undefined,
    vendedor: vendedor || undefined,
    categoriaN2: categoriaN2 || undefined,
  };

  const rows = await getPeriodComparisonBreakdown(targetPeriod, filters);
  const totals = sumRows(rows);
  const excedido = isExcedido(totals.proyectado, totals.real);
  const qtyChange = qtyDelta(totals.proyectado, totals.real);
  const usdChange = changePct(totals.proyectadoUsd, totals.realUsd);
  const groupByVendedor = !vendedor; // admin viewing everyone — organize the detail by vendedor.

  const closedPeriods = listRecentPeriods(8).filter((p) => p.status === "closed");
  const periodLinkBase = `/dashboard/comparacion?period=${encodeURIComponent(contextPeriod)}${
    region ? `&region=${encodeURIComponent(region)}` : ""
  }${vendedor ? `&vendedor=${encodeURIComponent(vendedor)}` : ""}${
    categoriaN2 ? `&categoriaN2=${encodeURIComponent(categoriaN2)}` : ""
  }`;

  return (
    <div className="min-h-screen bg-surface-container-low">
      <TopNav session={session} active="/dashboard" />
      <main className="mx-auto max-w-container px-margin-mobile py-8 md:px-margin-desktop">
        <p className="text-label-md uppercase tracking-wide text-on-surface-variant">
          Proyectado vs. real
          {region && ` · ${REGION_LABELS[region]}`}
          {vendedor && ` · ${vendedor}`}
          {categoriaN2 && ` · ${categoriaN2}`}
        </p>
        <h1 className="text-headline-md text-on-surface">Desglose de la comparación</h1>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-label-md uppercase tracking-wide text-on-surface-variant">Elegir proyección:</span>
          {closedPeriods.map((p) => (
            <Link
              key={p.period}
              href={`${periodLinkBase}&targetPeriod=${encodeURIComponent(p.period)}`}
              className={`rounded-full border px-3 py-1.5 text-body-sm font-medium transition-colors ${
                p.period === targetPeriod
                  ? "border-primary bg-primary text-on-primary"
                  : "border-outline-variant bg-surface-container-lowest text-on-surface hover:border-primary hover:text-primary"
              }`}
            >
              {periodLabel(p.period)}
            </Link>
          ))}
        </div>

        <h2 className="mt-6 text-label-md uppercase tracking-wide text-on-surface-variant">Cantidad</h2>
        <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SummaryCard label="Proyectado" value={formatQtySplit(totals.proyectado)} />
          <SummaryCard label="Real" value={formatQtySplit(totals.real)} alert={excedido} />
          <SummaryCard label="Variación" value={formatChange(qtyChange === null ? null : qtyChange * 100)} alert={excedido} />
        </div>

        <h2 className="mt-6 text-label-md uppercase tracking-wide text-on-surface-variant">Dólares</h2>
        <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SummaryCard label="Proyectado" value={formatUsd(totals.proyectadoUsd)} />
          <SummaryCard label="Real" value={formatUsd(totals.realUsd)} />
          <SummaryCard label="Variación" value={formatChange(usdChange)} />
        </div>

        {excedido && (
          <div className="mt-4 rounded-md border border-error-container bg-error-container px-4 py-2.5 text-body-sm text-on-error-container">
            Lo real superó el doble de lo proyectado.
          </div>
        )}

        {rows.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-10 text-center">
            <p className="text-body-md text-on-surface-variant">
              Sin datos para {periodLabel(targetPeriod)} con estos filtros.
            </p>
          </div>
        ) : groupByVendedor ? (
          <VendedorGroups rows={rows} />
        ) : (
          <div className="mt-6">
            <ComparisonTable rows={rows} showVendedor={false} />
          </div>
        )}
      </main>
    </div>
  );
}

function formatChange(pct: number | null): string {
  if (pct === null) return "—";
  return `${pct >= 0 ? "+" : ""}${Math.round(pct)}%`;
}

// Every product of every vendedor is thousands of rows — each block shows the ones that moved
// the most (in dollars); the totals in its header still add up all of them.
const MAX_ROWS_PER_GROUP = 25;

function VendedorGroups({ rows }: { rows: PeriodComparisonRow[] }) {
  const byVendedor = new Map<string, PeriodComparisonRow[]>();
  for (const r of rows) {
    const list = byVendedor.get(r.vendedor) ?? [];
    list.push(r);
    byVendedor.set(r.vendedor, list);
  }
  const groups = [...byVendedor.entries()]
    .map(([vendedor, items]) => ({
      vendedor,
      total: items.length,
      items: [...items]
        .sort((a, b) => Math.abs(b.real_usd - b.proyectado_usd) - Math.abs(a.real_usd - a.proyectado_usd))
        .slice(0, MAX_ROWS_PER_GROUP),
      ...sumRows(items),
    }))
    .sort((a, b) => b.realUsd - b.proyectadoUsd - (a.realUsd - a.proyectadoUsd));

  return (
    <div className="mt-6 flex flex-col gap-4">
      {groups.map((g) => {
        const qtyChange = qtyDelta(g.proyectado, g.real);
        const usdChange = changePct(g.proyectadoUsd, g.realUsd);
        const groupExcedido = isExcedido(g.proyectado, g.real);
        const muted = groupExcedido ? "text-on-error-container" : "text-on-surface-variant";
        return (
          <section
            key={g.vendedor}
            className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm shadow-black/[0.04]"
          >
            <div
              className={`flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant px-5 py-3 ${
                groupExcedido ? "bg-error-container" : "bg-surface-container-low"
              }`}
            >
              <h2
                className={`text-body-lg font-semibold ${groupExcedido ? "text-on-error-container" : "text-on-surface"}`}
              >
                {g.vendedor}
              </h2>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-body-sm">
                <span className={`flex items-center gap-2 ${muted}`}>
                  {formatQtySplit(g.real)} / {formatQtySplit(g.proyectado)} proy.
                  <ChangeBadge pct={qtyChange === null ? null : qtyChange * 100} red={groupExcedido} />
                </span>
                <span className={`flex items-center gap-2 ${muted}`}>
                  {formatUsd(g.realUsd)} / {formatUsd(g.proyectadoUsd)} proy.
                  <ChangeBadge pct={usdChange} />
                </span>
              </div>
            </div>
            <ComparisonTable rows={g.items} showVendedor={false} />
            {g.total > g.items.length && (
              <p className="border-t border-outline-variant px-5 py-2 text-label-sm text-on-surface-variant">
                Mostrando los {g.items.length} productos con más diferencia de {g.total}. Filtra por vendedor para
                verlos todos.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ChangeBadge({ pct, red = false }: { pct: number | null; red?: boolean }) {
  if (pct === null) return <span className="text-body-sm text-on-surface-variant">—</span>;
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-label-sm font-medium ${
        red
          ? "bg-on-error-container/15 text-on-error-container"
          : pct >= 0
            ? "bg-tertiary-fixed text-on-tertiary-fixed-variant"
            : "bg-secondary-fixed text-on-secondary-fixed-variant"
      }`}
    >
      {pct >= 0 ? "+" : ""}
      {Math.round(pct)}%
    </span>
  );
}

function ComparisonTable({ rows, showVendedor }: { rows: PeriodComparisonRow[]; showVendedor: boolean }) {
  const th = "px-4 py-2 text-label-md uppercase tracking-wide text-on-surface-variant";
  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm shadow-black/[0.04]">
      <div className="thin-scroll overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low">
              {showVendedor && <th className={`${th} text-left`}>Vendedor</th>}
              <th className={`${th} text-left`}>Producto</th>
              <th className={`${th} text-right`}>Proyectado</th>
              <th className={`${th} text-right`}>Real</th>
              <th className={`${th} text-right`}>Var.</th>
              <th className={`${th} text-right`}>Proy. US$</th>
              <th className={`${th} text-right`}>Real US$</th>
              <th className={`${th} text-right`}>Var. US$</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const qty = changePct(r.proyectado, r.real);
              const usd = changePct(r.proyectado_usd, r.real_usd);
              const rowExcedido = r.proyectado > 0 && r.real > r.proyectado * 2;
              const cell = rowExcedido ? "text-on-error-container" : "text-on-surface";
              const cellMuted = rowExcedido ? "text-on-error-container" : "text-on-surface-variant";
              return (
                <tr
                  key={`${r.vendedor}::${r.producto_ref}`}
                  className={`border-b border-outline-variant last:border-b-0 ${
                    rowExcedido ? "bg-error-container" : "hover:bg-surface-container-low"
                  }`}
                >
                  {showVendedor && <td className={`px-4 py-3 text-body-sm ${cell}`}>{r.vendedor}</td>}
                  <td className={`px-4 py-3 text-body-sm ${cell}`}>{r.producto_nombre}</td>
                  <td className={`px-4 py-3 text-right text-body-sm tabular-nums ${cellMuted}`}>
                    {formatQty(r.proyectado)}
                    <UnitTag unit={r.unidad} />
                  </td>
                  <td className={`px-4 py-3 text-right text-body-sm font-medium tabular-nums ${cell}`}>
                    {formatQty(r.real)}
                    <UnitTag unit={r.unidad} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ChangeBadge pct={qty} red={rowExcedido} />
                  </td>
                  <td className={`px-4 py-3 text-right text-body-sm tabular-nums ${cellMuted}`}>
                    {formatUsd(r.proyectado_usd)}
                  </td>
                  <td className={`px-4 py-3 text-right text-body-sm font-medium tabular-nums ${cell}`}>
                    {formatUsd(r.real_usd)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ChangeBadge pct={usd} red={rowExcedido} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-5 shadow-sm shadow-black/[0.04] ${
        alert ? "border-error-container bg-error-container" : "border-outline-variant bg-surface-container-lowest"
      }`}
    >
      <p className={`text-label-md uppercase tracking-wide ${alert ? "text-on-error-container" : "text-on-surface-variant"}`}>
        {label}
      </p>
      <p className={`mt-2 text-headline-md ${alert ? "text-on-error-container" : "text-on-surface"}`}>{value}</p>
    </div>
  );
}
