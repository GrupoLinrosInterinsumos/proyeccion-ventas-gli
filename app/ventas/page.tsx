import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getVendorProductTable } from "@/lib/sales";
import { currentProjectionPeriod, lastClosedMonths, periodLabel } from "@/lib/period";
import { REGION_LABELS } from "@/lib/regions";
import TopNav from "@/components/TopNav";
import VendorSection from "@/components/VendorSection";

export default async function VentasPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const period = currentProjectionPeriod();
  const closed = lastClosedMonths(3);
  const rows = await getVendorProductTable(session.vendedor, period);

  return (
    <div className="min-h-screen bg-surface-container-low">
      <TopNav session={session} active="/ventas" />
      <main className="mx-auto max-w-container px-margin-mobile py-8 md:px-margin-desktop">
        <div className="mb-6">
          <p className="text-label-md uppercase tracking-wide text-on-surface-variant">
            {session.region ? `${REGION_LABELS[session.region]} · ` : ""}Proyección de {periodLabel(period)}
          </p>
          <h1 className="text-headline-md text-on-surface">Mi proyección de ventas</h1>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Promedio mensual calculado sobre los 3 últimos meses cerrados:{" "}
            {closed.map(periodLabel).join(" · ")}
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-10 text-center">
            <p className="text-body-md text-on-surface-variant">
              Aún no hay data cargada para {session.vendedor} en los últimos 3 meses cerrados.
            </p>
          </div>
        ) : (
          <VendorSection period={period} vendedor={session.vendedor} rows={rows} defaultOpen editable />
        )}
      </main>
    </div>
  );
}
