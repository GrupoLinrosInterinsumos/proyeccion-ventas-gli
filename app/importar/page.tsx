import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listImports } from "@/lib/sales";
import TopNav from "@/components/TopNav";
import UploadForm from "@/components/UploadForm";

function formatDate(iso: string) {
  return new Date(iso + "Z").toLocaleString("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function ImportarPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.isAdmin) redirect("/ventas");

  const imports = await listImports();

  return (
    <div className="min-h-screen bg-background">
      <TopNav session={session} active="/importar" />
      <main className="mx-auto max-w-container px-margin-mobile py-8 md:px-margin-desktop">
        <p className="text-label-md uppercase tracking-wide text-on-surface-variant">Data mensual</p>
        <h1 className="text-headline-md text-on-surface">Importar reporte de ventas</h1>
        <p className="mt-1 max-w-2xl text-body-sm text-on-surface-variant">
          Sube el Excel acumulado del año (hoja &quot;DATA&quot;). El sistema reemplaza automáticamente
          los meses que vengan en el archivo y recalcula el promedio de venta mensual de cada
          vendedor.
        </p>

        <div className="mt-6 max-w-2xl rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
          <UploadForm />
        </div>

        <section className="mt-8 max-w-2xl rounded-xl border border-outline-variant bg-surface-container-lowest">
          <h2 className="border-b border-outline-variant px-5 py-3.5 text-body-lg font-semibold text-on-surface">
            Historial de importaciones
          </h2>
          {imports.length === 0 ? (
            <p className="px-5 py-6 text-body-sm text-on-surface-variant">Todavía no se ha importado ningún archivo.</p>
          ) : (
            <ul className="divide-y divide-outline-variant">
              {imports.map((imp) => {
                const periods = JSON.parse(imp.periods_json) as string[];
                return (
                  <li key={imp.id} className="flex items-center justify-between gap-4 px-5 py-3">
                    <div>
                      <p className="text-body-sm font-medium text-on-surface">{imp.filename}</p>
                      <p className="text-label-sm text-on-surface-variant">
                        {formatDate(imp.uploaded_at)} &middot; {imp.uploaded_by_name ?? "—"} &middot;{" "}
                        {imp.row_count} registros &middot; {periods.join(", ")}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
