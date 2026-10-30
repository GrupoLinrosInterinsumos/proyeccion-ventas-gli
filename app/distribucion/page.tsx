import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { currentMonthPeriod } from "@/lib/comparison";
import { listDistribuciones, mesesDisponibles } from "@/lib/distribucion";
import { listCatalogProducts } from "@/lib/sales";
import TopNav from "@/components/TopNav";
import DistribucionView from "@/components/DistribucionView";

/**
 * Productos con poco stock que se están repartiendo entre clientes: cuánto recibe cada cliente y
 * hasta qué mes. Lo ven todos los usuarios; solo el administrador agrega, edita o elimina.
 */
export default async function DistribucionPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [rows, catalog] = await Promise.all([
    listDistribuciones(),
    session.isAdmin ? listCatalogProducts() : Promise.resolve([]),
  ]);

  return (
    <div className="min-h-screen bg-surface-container-low">
      <TopNav session={session} active="/distribucion" />
      <main className="mx-auto max-w-container px-margin-mobile py-8 md:px-margin-desktop">
        <div className="mb-5">
          <p className="text-label-md uppercase tracking-wide text-on-surface-variant">Productos con poco stock</p>
          <h1 className="text-headline-md text-on-surface">Distribución</h1>
          <p className="mt-1 max-w-3xl text-body-sm text-on-surface-variant">
            Cuánto se está distribuyendo de cada producto a cada cliente y hasta qué mes.
            {session.isAdmin
              ? " Tú puedes agregar, editar y eliminar; los comerciales solo la consultan."
              : " Solo el administrador la actualiza."}
          </p>
        </div>
        <DistribucionView
          rows={rows}
          isAdmin={session.isAdmin}
          mesActual={currentMonthPeriod()}
          meses={mesesDisponibles()}
          catalog={catalog}
        />
      </main>
    </div>
  );
}
