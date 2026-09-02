import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { listRecentPeriods, periodLabel } from "@/lib/period";
import { REGION_LABELS } from "@/lib/regions";
import TopNav from "@/components/TopNav";

export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const periods = listRecentPeriods(6);
  const destination = session.vendedor ? "/ventas" : "/dashboard";

  return (
    <div className="min-h-screen bg-surface-container-low">
      <TopNav session={session} active="/" />
      <main className="mx-auto max-w-container px-margin-mobile py-8 md:px-margin-desktop">
        <p className="text-label-md uppercase tracking-wide text-on-surface-variant">
          {session.region ? `${REGION_LABELS[session.region]} · ` : ""}Inicio
        </p>
        <h1 className="text-headline-md text-on-surface">Proyecciones</h1>
        <p className="mt-1 max-w-2xl text-body-sm text-on-surface-variant">
          Cada proyección se trabaja durante el mes anterior y se cierra el último día de ese mes
          a las 7pm. Elige un periodo para verlo — los cerrados quedan como historial de solo
          lectura.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          {periods.map(({ period, status }) => (
            <Link
              key={period}
              href={`${destination}?period=${period}`}
              className={`flex items-center justify-between gap-4 rounded-xl border px-5 py-4 shadow-sm shadow-black/[0.04] transition-colors ${
                status === "open"
                  ? "border-primary bg-surface-container-lowest hover:bg-primary-fixed/10"
                  : "border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low"
              }`}
            >
              <div>
                <p className="text-body-lg font-semibold text-on-surface">{periodLabel(period)}</p>
                <p className="text-body-sm text-on-surface-variant">
                  {status === "open"
                    ? session.vendedor
                      ? "Proyección abierta — puedes editarla"
                      : "Proyección abierta"
                    : "Cerrada — historial de solo lectura"}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-label-sm font-medium uppercase tracking-wide ${
                  status === "open"
                    ? "bg-primary-fixed text-on-primary-fixed-variant"
                    : "bg-surface-container-high text-on-surface-variant"
                }`}
              >
                {status === "open" ? "Abierta" : "Cerrada"}
              </span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
