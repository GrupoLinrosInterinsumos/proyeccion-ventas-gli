import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { currentMonthPeriod, getMonthComparison } from "@/lib/comparison";
import { periodLabel } from "@/lib/period";
import TopNav from "@/components/TopNav";
import ComparisonView from "@/components/ComparisonView";

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function recentMonths(current: string, count = 4): string[] {
  const [y, m] = current.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const z = y * 12 + (m - 1) - i;
    return `${Math.floor(z / 12)}-${String((z % 12) + 1).padStart(2, "0")}`;
  });
}

const limaFormat = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Proyección del mes contra lo vendido hasta hoy, por vendedor, producto y cliente. Las ventas
 * salen del último reporte importado (se refresca cada día), así que el avance del mes se mide
 * hasta la fecha de corte de ese reporte.
 */
export default async function ComparacionPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const current = currentMonthPeriod();
  const requested = (await searchParams).period?.trim() ?? "";
  const period = PERIOD_RE.test(requested) && requested <= current ? requested : current;

  // This page (and only this page) is open to everyone: every vendedor sees every vendedor's comparison.
  // Writing stays restricted: a vendedor can only leave observations on their own clients.
  const data = await getMonthComparison(period);

  const [py, pm] = period.split("-").map(Number);
  const diasMes = new Date(py, pm, 0).getDate();
  let dia = diasMes;
  let hastaLabel: string | null = null;
  if (data.hasta) {
    const [hy, hm, hd] = data.hasta.split("-").map(Number);
    if (hy * 12 + hm === py * 12 + pm) {
      dia = hd;
      hastaLabel = `${String(hd).padStart(2, "0")}/${String(hm).padStart(2, "0")}`;
    } else if (hy * 12 + hm < py * 12 + pm) {
      dia = 0;
    }
  } else if (period === current) {
    dia = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Lima", day: "numeric" }).format(new Date()));
  }

  return (
    <div className="min-h-screen bg-surface-container-low">
      <TopNav session={session} active="/comparacion" />
      <main className="mx-auto max-w-container px-margin-mobile py-8 md:px-margin-desktop">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-label-md uppercase tracking-wide text-on-surface-variant">
              Resumen general &middot; {periodLabel(period)}
              {hastaLabel && (
                <span className="ml-2 rounded bg-surface-container-high px-1.5 py-0.5 normal-case text-on-surface-variant">
                  Ventas al {hastaLabel}
                </span>
              )}
            </p>
            <h1 className="text-headline-md text-on-surface">Comparación: proyectado vs. vendido</h1>
            <p className="mt-1 max-w-3xl text-body-sm text-on-surface-variant">
              Lo que se proyectó para {periodLabel(period)} contra lo que se lleva vendido del mes. Se actualiza con cada
              reporte de ventas que se carga
              {data.actualizado ? ` (última carga: ${limaFormat.format(new Date(data.actualizado))})` : ""}.
            </p>
          </div>
          <div className="flex items-center gap-1 text-body-sm">
            {recentMonths(current).map((m) => (
              <Link
                key={m}
                href={`/comparacion?period=${m}`}
                className={`rounded-md px-2.5 py-1.5 font-medium ${
                  m === period
                    ? "bg-primary-fixed text-on-primary-fixed-variant"
                    : "text-on-surface-variant hover:bg-surface-container-high"
                }`}
              >
                {periodLabel(m)}
              </Link>
            ))}
          </div>
        </div>

        {data.rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-10 text-center text-body-md text-on-surface-variant">
            Aún no hay proyección ni ventas de {periodLabel(period)}.
          </div>
        ) : (
          <ComparisonView
            data={data}
            isAdmin={session.isAdmin}
            ownVendedor={session.vendedor}
            dia={dia}
            diasMes={diasMes}
            hastaLabel={hastaLabel}
          />
        )}
      </main>
    </div>
  );
}
