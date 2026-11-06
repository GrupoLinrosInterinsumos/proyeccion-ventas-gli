import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { currentMonthPeriod } from "@/lib/comparison";
import { listDistribuciones } from "@/lib/distribucion";
import TopNav from "@/components/TopNav";
import DistribucionView from "@/components/DistribucionView";

/**
 * Lo que el administrador ajustó de lo proyectado por cada vendedor, agrupado por producto, equipo, vendedor
 * y cliente. Es solo de consulta: los ajustes se hacen en la columna «Ajuste» de Comparación.
 */
export default async function DistribucionPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const rows = await listDistribuciones();

  return (
    <div className="min-h-screen bg-surface-container-low">
      <TopNav session={session} active="/distribucion" />
      <main className="mx-auto max-w-container px-margin-mobile py-8 md:px-margin-desktop">
        <div className="mb-5">
          <p className="text-label-md uppercase tracking-wide text-on-surface-variant">Proyección ajustada</p>
          <h1 className="text-headline-md text-on-surface">Distribución</h1>
          <p className="mt-1 max-w-3xl text-body-sm text-on-surface-variant">
            Cuánto le corresponde a cada cliente de cada producto, según los ajustes del administrador a lo que proyectó
            cada vendedor.
            {session.isAdmin
              ? " Se ajusta en la columna «Ajuste» de Comparación; aquí solo se consulta."
              : " Solo se consulta; el administrador la actualiza desde Comparación."}
          </p>
        </div>
        <DistribucionView rows={rows} mesActual={currentMonthPeriod()} />
      </main>
    </div>
  );
}
