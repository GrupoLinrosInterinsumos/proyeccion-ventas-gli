import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  getDashboardKpis,
  getProductBreakdown,
  getRegionBreakdown,
  getVendorProductTable,
  getVendorSummaryForRegion,
  listVendedores,
  type ProductBreakdownRow,
} from "@/lib/sales";
import { currentProjectionPeriod, lastClosedMonths, periodLabel } from "@/lib/period";
import { isRegion, REGION_LABELS, type Region } from "@/lib/regions";
import { formatPercent, formatQty } from "@/lib/format";
import TopNav from "@/components/TopNav";
import DashboardFilters from "@/components/DashboardFilters";
import VendorSection from "@/components/VendorSection";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string; vendedor?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.isAdmin) redirect("/ventas");

  const params = await searchParams;
  const region: Region | "" = isRegion(params.region) ? params.region : "";
  const vendedor = params.vendedor?.trim() || "";

  const period = currentProjectionPeriod();
  const closed = lastClosedMonths(3);

  const allVendedores = await listVendedores();
  const vendedorOptions = allVendedores
    .filter((v) => !region || v.region === region)
    .map((v) => ({ vendedor: v.vendedor, name: v.name }));

  const kpis = await getDashboardKpis(period, { region: region || undefined, vendedor: vendedor || undefined });

  return (
    <div className="min-h-screen bg-surface-container-low">
      <TopNav session={session} active="/dashboard" />
      <main className="mx-auto max-w-container px-margin-mobile py-8 md:px-margin-desktop">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-label-md uppercase tracking-wide text-on-surface-variant">
              Resumen general &middot; Proyección de {periodLabel(period)}
            </p>
            <h1 className="text-headline-md text-on-surface">Dashboard</h1>
            <p className="mt-1 text-body-sm text-on-surface-variant">
              Promedios calculados sobre {closed.map(periodLabel).join(" · ")}
            </p>
          </div>
          <DashboardFilters region={region} vendedor={vendedor} vendedorOptions={vendedorOptions} />
        </div>

        <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            icon={<IconBox />}
            tone="primary"
            label="Promedio mensual (3m)"
            value={formatQty(kpis.promedioTotal)}
            hint="unidades"
          />
          <KpiCard
            icon={<IconTarget />}
            tone="secondary"
            label="Proyección total del mes"
            value={formatQty(kpis.proyeccionTotal)}
            delta={
              kpis.promedioTotal > 0
                ? ((kpis.proyeccionTotal - kpis.promedioTotal) / kpis.promedioTotal) * 100
                : null
            }
          />
          <KpiCard icon={<IconUsers />} tone="tertiary" label="Vendedores" value={String(kpis.vendedores)} />
          <KpiCard icon={<IconGrid />} tone="primary" label="Productos con movimiento" value={String(kpis.productos)} />
          <KpiCard
            icon={<IconCheck />}
            tone="tertiary"
            label="Cobertura de proyección"
            value={formatPercent(kpis.paresTotal > 0 ? (kpis.paresConProyeccion / kpis.paresTotal) * 100 : 0)}
            hint={`${kpis.paresConProyeccion} de ${kpis.paresTotal} productos·vendedor`}
          />
        </div>

        {vendedor ? (
          <VendorDrilldown vendedor={vendedor} period={period} />
        ) : region ? (
          <VendorSummarySection region={region} period={period} />
        ) : (
          <RegionSummarySection period={period} />
        )}
      </main>
    </div>
  );
}

async function VendorDrilldown({ vendedor, period }: { vendedor: string; period: string }) {
  const rows = await getVendorProductTable(vendedor, period);
  return (
    <div className="mt-8">
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-10 text-center">
          <p className="text-body-md text-on-surface-variant">
            {vendedor} no tiene ventas registradas en los últimos 3 meses cerrados.
          </p>
        </div>
      ) : (
        <VendorSection period={period} vendedor={vendedor} rows={rows} defaultOpen editable={false} />
      )}
      <p className="mt-3 text-body-sm text-on-surface-variant">
        Vista de solo lectura. Cada vendedor gestiona su propia proyección y observaciones.
      </p>
    </div>
  );
}

async function VendorSummarySection({ region, period }: { region: Region; period: string }) {
  const rows = await getVendorSummaryForRegion(region, period);
  const products = await getProductBreakdown(period, { region }, 10);

  return (
    <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm shadow-black/[0.04] lg:col-span-2">
        <h2 className="flex items-center gap-2.5 border-b border-outline-variant px-5 py-3.5 text-body-lg font-semibold text-on-surface">
          <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
          Por vendedor &middot; {REGION_LABELS[region]}
        </h2>
        <div className="thin-scroll overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low">
                <th className="px-5 py-2 text-left text-label-md uppercase tracking-wide text-on-surface-variant">
                  Vendedor
                </th>
                <th className="px-5 py-2 text-right text-label-md uppercase tracking-wide text-on-surface-variant">
                  Productos
                </th>
                <th className="px-5 py-2 text-right text-label-md uppercase tracking-wide text-on-surface-variant">
                  Promedio 3m
                </th>
                <th className="px-5 py-2 text-right text-label-md uppercase tracking-wide text-on-surface-variant">
                  Proyección
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const delta =
                  r.promedio_mensual > 0 ? ((r.proyeccion - r.promedio_mensual) / r.promedio_mensual) * 100 : null;
                return (
                  <tr key={r.vendedor} className="border-b border-outline-variant last:border-b-0 hover:bg-surface-container-low">
                    <td className="px-5 py-3 text-body-sm font-medium text-on-surface">
                      {r.vendedor}
                      {r.pendientes > 0 && (
                        <span className="ml-2 rounded bg-secondary-fixed px-1.5 py-0.5 text-label-sm text-on-secondary-fixed-variant">
                          {r.pendientes} sin proyectar
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right text-body-sm tabular-nums text-on-surface-variant">
                      {r.productos}
                    </td>
                    <td className="px-5 py-3 text-right text-body-sm tabular-nums text-on-surface">
                      {formatQty(r.promedio_mensual)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-body-sm font-medium tabular-nums text-primary">
                        {formatQty(r.proyeccion)}
                      </span>
                      {delta !== null && (
                        <span
                          className={`ml-2 rounded px-1.5 py-0.5 text-label-sm font-medium ${
                            delta >= 0
                              ? "bg-tertiary-fixed text-on-tertiary-fixed-variant"
                              : "bg-secondary-fixed text-on-secondary-fixed-variant"
                          }`}
                        >
                          {delta >= 0 ? "+" : ""}
                          {Math.round(delta)}%
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <ProductBreakdownCard products={products} />
    </div>
  );
}

async function RegionSummarySection({ period }: { period: string }) {
  const summary = await getRegionBreakdown(period);
  const products = await getProductBreakdown(period, {}, 10);

  return (
    <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm shadow-black/[0.04] lg:col-span-2">
        <h2 className="flex items-center gap-2.5 border-b border-outline-variant px-5 py-3.5 text-body-lg font-semibold text-on-surface">
          <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
          Por región
        </h2>
        <div className="thin-scroll overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low">
                <th className="px-5 py-2 text-left text-label-md uppercase tracking-wide text-on-surface-variant">
                  Región
                </th>
                <th className="px-5 py-2 text-right text-label-md uppercase tracking-wide text-on-surface-variant">
                  Vendedores
                </th>
                <th className="px-5 py-2 text-right text-label-md uppercase tracking-wide text-on-surface-variant">
                  Productos
                </th>
                <th className="px-5 py-2 text-right text-label-md uppercase tracking-wide text-on-surface-variant">
                  Promedio 3m
                </th>
                <th className="px-5 py-2 text-right text-label-md uppercase tracking-wide text-on-surface-variant">
                  Proyección
                </th>
              </tr>
            </thead>
            <tbody>
              {summary.map((r) => {
                const delta =
                  r.promedioTotal > 0 ? ((r.proyeccionTotal - r.promedioTotal) / r.promedioTotal) * 100 : null;
                return (
                  <tr key={r.region} className="border-b border-outline-variant last:border-b-0 hover:bg-surface-container-low">
                    <td className="px-5 py-3 text-body-sm font-medium text-on-surface">
                      {REGION_LABELS[r.region]}
                    </td>
                    <td className="px-5 py-3 text-right text-body-sm tabular-nums text-on-surface-variant">
                      {r.vendedores}
                    </td>
                    <td className="px-5 py-3 text-right text-body-sm tabular-nums text-on-surface-variant">
                      {r.productos}
                    </td>
                    <td className="px-5 py-3 text-right text-body-sm tabular-nums text-on-surface">
                      {formatQty(r.promedioTotal)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-body-sm font-medium tabular-nums text-primary">
                        {formatQty(r.proyeccionTotal)}
                      </span>
                      {delta !== null && (
                        <span
                          className={`ml-2 rounded px-1.5 py-0.5 text-label-sm font-medium ${
                            delta >= 0
                              ? "bg-tertiary-fixed text-on-tertiary-fixed-variant"
                              : "bg-secondary-fixed text-on-secondary-fixed-variant"
                          }`}
                        >
                          {delta >= 0 ? "+" : ""}
                          {Math.round(delta)}%
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <ProductBreakdownCard products={products} />
    </div>
  );
}

function ProductBreakdownCard({ products }: { products: ProductBreakdownRow[] }) {
  const max = Math.max(...products.map((p) => p.promedio_mensual), 1);
  return (
    <section className="rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm shadow-black/[0.04]">
      <h2 className="flex items-center gap-2.5 border-b border-outline-variant px-5 py-3.5 text-body-lg font-semibold text-on-surface">
        <span className="h-2 w-2 rounded-full bg-tertiary" aria-hidden />
        Por producto
      </h2>
      {products.length === 0 ? (
        <p className="px-5 py-6 text-body-sm text-on-surface-variant">Sin datos para este filtro.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-outline-variant">
          {products.map((p) => (
            <li key={p.producto_ref} className="px-5 py-3">
              <div className="mb-1 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-body-sm font-medium text-on-surface">{p.producto_nombre}</p>
                  <p className="truncate text-label-sm text-on-surface-variant">
                    {p.categoria ?? "Sin categoría"}
                    {p.marca ? ` · ${p.marca}` : ""} · {p.vendedores} vendedor{p.vendedores === 1 ? "" : "es"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-body-sm font-semibold tabular-nums text-on-surface">
                    {formatQty(p.promedio_mensual)}
                  </p>
                </div>
              </div>
              <span className="block h-1.5 overflow-hidden rounded-full bg-surface-container-highest">
                <span
                  className="block h-full rounded-full bg-tertiary"
                  style={{ width: `${(p.promedio_mensual / max) * 100}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const TONE_CHIP: Record<"primary" | "secondary" | "tertiary", string> = {
  primary: "bg-primary-fixed text-on-primary-fixed-variant",
  secondary: "bg-secondary-fixed text-on-secondary-fixed-variant",
  tertiary: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
};

function KpiCard({
  label,
  value,
  delta,
  hint,
  icon,
  tone = "primary",
}: {
  label: string;
  value: string;
  delta?: number | null;
  hint?: string;
  icon?: ReactNode;
  tone?: "primary" | "secondary" | "tertiary";
}) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm shadow-black/[0.04]">
      <div className="flex items-center gap-3">
        {icon && (
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TONE_CHIP[tone]}`}>
            {icon}
          </span>
        )}
        <p className="text-label-md uppercase tracking-wide text-on-surface-variant">{label}</p>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <p className="text-headline-lg text-on-surface">{value}</p>
        {delta !== null && delta !== undefined && (
          <span
            className={`rounded px-1.5 py-0.5 text-label-sm font-medium ${
              delta >= 0
                ? "bg-tertiary-fixed text-on-tertiary-fixed-variant"
                : "bg-secondary-fixed text-on-secondary-fixed-variant"
            }`}
          >
            {delta >= 0 ? "+" : ""}
            {Math.round(delta)}%
          </span>
        )}
      </div>
      {hint && <p className="mt-1 text-label-sm text-on-surface-variant">{hint}</p>}
    </div>
  );
}

function IconBox() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m3.5 7 8.5-4 8.5 4-8.5 4-8.5-4Z" strokeLinejoin="round" />
      <path d="M3.5 7v10l8.5 4 8.5-4V7" strokeLinejoin="round" />
      <path d="M12 11v10" />
    </svg>
  );
}

function IconTarget() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.5" fill="currentColor" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" strokeLinecap="round" />
      <path d="M16 8.5a3 3 0 1 1 0 5.9" strokeLinecap="round" />
      <path d="M15 14c2.5.3 4.5 2.1 4.5 5" strokeLinecap="round" />
    </svg>
  );
}

function IconGrid() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.2" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.5 2.3 2.3 4.7-5.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
