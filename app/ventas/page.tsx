import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getVendorProductTable, getFullCatalogProductTable } from "@/lib/sales";
import { openProjectionPeriod, closedMonthsForPeriod, periodLabel, periodStatus } from "@/lib/period";
import { REGION_LABELS } from "@/lib/regions";
import TopNav from "@/components/TopNav";
import VendorSection from "@/components/VendorSection";

export default async function VentasPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.vendedor) redirect("/dashboard");

  const params = await searchParams;
  const open = openProjectionPeriod();
  const period = params.period?.trim() || open;
  const status = periodStatus(period);
  if (status === "future") redirect(`/ventas?period=${open}`);
  const editable = status === "open";

  const closed = closedMonthsForPeriod(period);
  const rows = session.isSpot
    ? await getFullCatalogProductTable(session.vendedor, period)
    : await getVendorProductTable(session.vendedor, period);

  return (
    <div className="min-h-screen bg-surface-container-low">
      <TopNav session={session} active="/ventas" />
      <main className="mx-auto max-w-container px-margin-mobile py-8 md:px-margin-desktop">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-label-md uppercase tracking-wide text-on-surface-variant">
              {session.region ? `${REGION_LABELS[session.region]} · ` : ""}Proyección de {periodLabel(period)}
              {!editable && (
                <span className="ml-2 rounded bg-surface-container-high px-1.5 py-0.5 text-on-surface-variant">
                  Cerrada · solo lectura
                </span>
              )}
            </p>
            <h1 className="text-headline-md text-on-surface">Mi proyección de ventas</h1>
            <p className="mt-1 text-body-sm text-on-surface-variant">
              {session.isSpot
                ? "Catálogo completo — agrega una proyección si surge una venta puntual."
                : `Promedio mensual calculado sobre los 3 últimos meses cerrados: ${closed.map(periodLabel).join(" · ")}`}
            </p>
          </div>
          <a href="/" className="text-body-sm text-primary hover:underline">
            Ver otros periodos
          </a>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-10 text-center">
            <p className="text-body-md text-on-surface-variant">
              Aún no hay data cargada para {session.vendedor} en los últimos 3 meses cerrados.
            </p>
          </div>
        ) : (
          <VendorSection
            period={period}
            vendedor={session.vendedor}
            rows={rows}
            defaultOpen
            editable={editable}
            searchable={rows.length > 15}
          />
        )}
      </main>
    </div>
  );
}
