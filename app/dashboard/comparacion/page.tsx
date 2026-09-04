import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getPeriodComparisonBreakdown, type PeriodComparisonRow } from "@/lib/sales";
import { openProjectionPeriod, closedMonthsForPeriod, periodStatus, periodLabel, listRecentPeriods } from "@/lib/period";
import { isRegion, REGION_LABELS, type Region } from "@/lib/regions";
import { formatQty } from "@/lib/format";
import TopNav from "@/components/TopNav";

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
  const totals = rows.reduce(
    (acc, r) => ({ proyectado: acc.proyectado + r.proyectado, real: acc.real + r.real }),
    { proyectado: 0, real: 0 }
  );
  const excedido = totals.proyectado > 0 && totals.real > totals.proyectado * 2;
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

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SummaryCard label="Proyectado" value={formatQty(totals.proyectado)} />
          <SummaryCard label="Real" value={formatQty(totals.real)} alert={excedido} />
          <SummaryCard
            label="Variación"
            value={
              totals.proyectado > 0
                ? `${totals.real >= totals.proyectado ? "+" : ""}${Math.round(
                    ((totals.real - totals.proyectado) / totals.proyectado) * 100
                  )}%`
                : "—"
            }
            alert={excedido}
          />
        </div>

        {excedido && (
          <div className="mt-4 rounded-md border border-error-container bg-error-container px-4 py-2.5 text-body-sm text-on-error-container">
            Lo real superó el doble de lo proyectado — coordinar con compras. Si ya se coordinó, se puede ignorar.
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
      items,
      proyectado: items.reduce((s, r) => s + r.proyectado, 0),
      real: items.reduce((s, r) => s + r.real, 0),
    }))
    .sort((a, b) => b.real - b.proyectado - (a.real - a.proyectado));

  return (
    <div className="mt-6 flex flex-col gap-4">
      {groups.map((g) => {
        const delta = g.proyectado > 0 ? ((g.real - g.proyectado) / g.proyectado) * 100 : null;
        const groupExcedido = g.proyectado > 0 && g.real > g.proyectado * 2;
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
              <div className="flex items-center gap-3 text-body-sm">
                <span className={groupExcedido ? "text-on-error-container" : "text-on-surface-variant"}>
                  {formatQty(g.real)} / {formatQty(g.proyectado)} proyectado
                </span>
                {delta !== null && (
                  <span
                    className={`rounded px-1.5 py-0.5 text-label-sm font-medium ${
                      groupExcedido
                        ? "bg-on-error-container/15 text-on-error-container"
                        : delta >= 0
                          ? "bg-tertiary-fixed text-on-tertiary-fixed-variant"
                          : "bg-secondary-fixed text-on-secondary-fixed-variant"
                    }`}
                  >
                    {delta >= 0 ? "+" : ""}
                    {Math.round(delta)}%
                  </span>
                )}
              </div>
            </div>
            <ComparisonTable rows={g.items} showVendedor={false} />
          </section>
        );
      })}
    </div>
  );
}

function ComparisonTable({ rows, showVendedor }: { rows: PeriodComparisonRow[]; showVendedor: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm shadow-black/[0.04]">
      <div className="thin-scroll overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low">
              {showVendedor && (
                <th className="px-5 py-2 text-left text-label-md uppercase tracking-wide text-on-surface-variant">
                  Vendedor
                </th>
              )}
              <th className="px-5 py-2 text-left text-label-md uppercase tracking-wide text-on-surface-variant">
                Producto
              </th>
              <th className="px-5 py-2 text-right text-label-md uppercase tracking-wide text-on-surface-variant">
                Proyectado
              </th>
              <th className="px-5 py-2 text-right text-label-md uppercase tracking-wide text-on-surface-variant">
                Real
              </th>
              <th className="px-5 py-2 text-right text-label-md uppercase tracking-wide text-on-surface-variant">
                Variación
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const delta = r.proyectado > 0 ? ((r.real - r.proyectado) / r.proyectado) * 100 : null;
              const rowExcedido = r.proyectado > 0 && r.real > r.proyectado * 2;
              return (
                <tr
                  key={`${r.vendedor}::${r.producto_ref}`}
                  className={`border-b border-outline-variant last:border-b-0 ${
                    rowExcedido ? "bg-error-container" : "hover:bg-surface-container-low"
                  }`}
                >
                  {showVendedor && (
                    <td
                      className={`px-5 py-3 text-body-sm ${rowExcedido ? "text-on-error-container" : "text-on-surface"}`}
                    >
                      {r.vendedor}
                    </td>
                  )}
                  <td
                    className={`px-5 py-3 text-body-sm ${rowExcedido ? "text-on-error-container" : "text-on-surface"}`}
                  >
                    {r.producto_nombre}
                  </td>
                  <td
                    className={`px-5 py-3 text-right text-body-sm tabular-nums ${rowExcedido ? "text-on-error-container" : "text-on-surface-variant"}`}
                  >
                    {formatQty(r.proyectado)}
                  </td>
                  <td
                    className={`px-5 py-3 text-right text-body-sm font-medium tabular-nums ${rowExcedido ? "text-on-error-container" : "text-on-surface"}`}
                  >
                    {formatQty(r.real)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {delta !== null ? (
                      <span
                        className={`rounded px-1.5 py-0.5 text-label-sm font-medium ${
                          rowExcedido
                            ? "bg-on-error-container/15 text-on-error-container"
                            : delta >= 0
                              ? "bg-tertiary-fixed text-on-tertiary-fixed-variant"
                              : "bg-secondary-fixed text-on-secondary-fixed-variant"
                        }`}
                      >
                        {delta >= 0 ? "+" : ""}
                        {Math.round(delta)}%
                      </span>
                    ) : (
                      <span className="text-body-sm text-on-surface-variant">—</span>
                    )}
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
      <p className={`mt-2 text-headline-lg ${alert ? "text-on-error-container" : "text-on-surface"}`}>{value}</p>
    </div>
  );
}
