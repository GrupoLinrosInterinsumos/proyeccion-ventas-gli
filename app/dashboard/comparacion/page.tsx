import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getPeriodComparison, getPeriodComparisonBreakdown } from "@/lib/sales";
import { openProjectionPeriod, periodStatus, periodLabel } from "@/lib/period";
import { isRegion, REGION_LABELS, type Region } from "@/lib/regions";
import { formatQty } from "@/lib/format";
import TopNav from "@/components/TopNav";

export default async function ComparacionPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string; vendedor?: string; categoriaN2?: string; period?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const isAdmin = session.isAdmin;

  const open = openProjectionPeriod();
  const requestedPeriod = params.period?.trim() || open;
  const period = periodStatus(requestedPeriod) === "future" ? open : requestedPeriod;

  const region: Region | "" = isAdmin ? (isRegion(params.region) ? params.region : "") : session.region ?? "";
  const vendedor = isAdmin ? params.vendedor?.trim() || "" : session.vendedor ?? "";
  const categoriaN2 = isAdmin ? params.categoriaN2?.trim() || "" : "";

  const filters = {
    region: region || undefined,
    vendedor: vendedor || undefined,
    categoriaN2: categoriaN2 || undefined,
  };

  const comparison = await getPeriodComparison(period, filters);
  const rows = await getPeriodComparisonBreakdown(comparison.previousPeriod, filters);

  return (
    <div className="min-h-screen bg-surface-container-low">
      <TopNav session={session} active="/dashboard" />
      <main className="mx-auto max-w-container px-margin-mobile py-8 md:px-margin-desktop">
        <p className="text-label-md uppercase tracking-wide text-on-surface-variant">
          Proyectado vs. real &middot; {periodLabel(comparison.previousPeriod)}
          {region && ` · ${REGION_LABELS[region]}`}
          {vendedor && ` · ${vendedor}`}
          {categoriaN2 && ` · ${categoriaN2}`}
        </p>
        <h1 className="text-headline-md text-on-surface">Desglose de la comparación</h1>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SummaryCard label="Proyectado" value={formatQty(comparison.proyectado)} />
          <SummaryCard label="Real" value={formatQty(comparison.real)} alert={comparison.excedido} />
          <SummaryCard
            label="Variación"
            value={
              comparison.proyectado > 0
                ? `${comparison.real >= comparison.proyectado ? "+" : ""}${Math.round(
                    ((comparison.real - comparison.proyectado) / comparison.proyectado) * 100
                  )}%`
                : "—"
            }
            alert={comparison.excedido}
          />
        </div>

        {comparison.excedido && (
          <div className="mt-4 rounded-md border border-error-container bg-error-container px-4 py-2.5 text-body-sm text-on-error-container">
            Lo real superó el doble de lo proyectado — coordinar con compras. Si ya se coordinó, se puede ignorar.
          </div>
        )}

        <section className="mt-6 overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm shadow-black/[0.04]">
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-low">
                  <th className="px-5 py-2 text-left text-label-md uppercase tracking-wide text-on-surface-variant">
                    Vendedor
                  </th>
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
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-6 text-center text-body-sm text-on-surface-variant">
                      Sin datos para {periodLabel(comparison.previousPeriod)} con estos filtros.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const delta = r.proyectado > 0 ? ((r.real - r.proyectado) / r.proyectado) * 100 : null;
                    const rowExcedido = r.proyectado > 0 && r.real > r.proyectado * 2;
                    return (
                      <tr
                        key={`${r.vendedor}::${r.producto_ref}`}
                        className={`border-b border-outline-variant last:border-b-0 ${
                          rowExcedido ? "bg-error-container" : "hover:bg-surface-container-low"
                        }`}
                      >
                        <td
                          className={`px-5 py-3 text-body-sm ${rowExcedido ? "text-on-error-container" : "text-on-surface"}`}
                        >
                          {r.vendedor}
                        </td>
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
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
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
