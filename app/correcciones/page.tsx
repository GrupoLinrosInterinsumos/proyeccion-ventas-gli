import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { applyCorrections, correctableProducts, listCorrections, projectedByCode } from "@/lib/corrections";
import { listRecentPeriods, periodLabel } from "@/lib/period";
import { formatQty } from "@/lib/format";
import TopNav from "@/components/TopNav";
import CorrectionForm from "@/components/CorrectionForm";
import VoidCorrectionButton from "@/components/VoidCorrectionButton";

export default async function CorreccionesPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.isAdmin) redirect("/ventas");

  // Solo meses cerrados: el mes abierto lo siguen editando los vendedores.
  const cerrados = listRecentPeriods(6).filter((p) => p.status === "closed").map((p) => p.period);
  const params = await searchParams;
  const period = params.period && cerrados.includes(params.period) ? params.period : cerrados[0];

  const [correcciones, productos, proyectado] = await Promise.all([
    listCorrections(period),
    correctableProducts(period),
    projectedByCode(period),
  ]);

  // Resultado por producto con las correcciones vigentes
  const vigentes = correcciones.filter((c) => !c.anulada_at);
  const resumen = [...new Set(vigentes.map((c) => c.producto_ref))].map((ref) => {
    const e = proyectado.get(ref);
    const original = e ? e.total - e.grupo : 0;
    const lista = vigentes.filter((c) => c.producto_ref === ref);
    return { ref, nombre: lista[0].producto_nombre, original, final: applyCorrections(original, lista).valor };
  });

  return (
    <div className="min-h-screen bg-surface-container-low">
      <TopNav session={session} active="/correcciones" />
      <main className="mx-auto max-w-container px-margin-mobile py-8 md:px-margin-desktop">
        <p className="text-label-md uppercase tracking-wide text-on-surface-variant">Reporte de cobertura de stock</p>
        <h1 className="text-headline-md text-on-surface">Correcciones de proyección</h1>
        <p className="mt-1 max-w-3xl text-body-sm text-on-surface-variant">
          Cuando se cae una venta (o entra una nueva) en un mes ya cerrado, corrige aquí la cantidad del producto. La
          proyección de los vendedores no se modifica: la corrección se aplica encima en el reporte semanal de cobertura de
          stock, en todos sus reportes de ese mes. Cantidades sin las ventas a LINROS / INTERINSUMOS.
        </p>

        <nav className="mt-5 flex flex-wrap gap-2" aria-label="Mes">
          {cerrados.map((p) => (
            <Link
              key={p}
              href={`/correcciones?period=${p}`}
              className={`rounded-full border px-3 py-1.5 text-body-sm ${
                p === period
                  ? "border-primary bg-primary text-on-primary"
                  : "border-outline-variant bg-surface-container-lowest text-on-surface hover:border-primary"
              }`}
            >
              {periodLabel(p)}
            </Link>
          ))}
        </nav>

        <section className="mt-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm shadow-black/[0.04]">
          <h2 className="mb-4 text-body-lg font-semibold text-on-surface">Nueva corrección · {periodLabel(period)}</h2>
          <CorrectionForm key={period} period={period} productos={productos} />
        </section>

        {resumen.length > 0 && (
          <section className="mt-8 rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm shadow-black/[0.04]">
            <h2 className="flex items-center gap-2.5 border-b border-outline-variant px-5 py-3.5 text-body-lg font-semibold text-on-surface">
              <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
              Proyección que usará el reporte ({resumen.length} producto{resumen.length === 1 ? "" : "s"})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-body-sm">
                <thead className="text-left text-label-sm uppercase tracking-wide text-on-surface-variant">
                  <tr>
                    <th className="px-5 py-2.5">Producto</th>
                    <th className="px-5 py-2.5 text-right">Vendedores</th>
                    <th className="px-5 py-2.5 text-right">Corregida</th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.map((r) => (
                    <tr key={r.ref} className="border-t border-outline-variant">
                      <td className="px-5 py-2.5">
                        <div className="font-medium text-on-surface">{r.nombre}</div>
                        <div className="text-label-sm text-on-surface-variant">{r.ref}</div>
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums">{formatQty(r.original)}</td>
                      <td className="px-5 py-2.5 text-right font-semibold tabular-nums">{formatQty(r.final)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="mt-8 rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm shadow-black/[0.04]">
          <h2 className="flex items-center gap-2.5 border-b border-outline-variant px-5 py-3.5 text-body-lg font-semibold text-on-surface">
            <span className="h-2 w-2 rounded-full bg-secondary" aria-hidden />
            Historial de {periodLabel(period)}
          </h2>
          {correcciones.length === 0 ? (
            <p className="px-5 py-6 text-body-sm text-on-surface-variant">Sin correcciones en este mes.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-body-sm">
                <thead className="text-left text-label-sm uppercase tracking-wide text-on-surface-variant">
                  <tr>
                    <th className="px-5 py-2.5">Producto</th>
                    <th className="px-5 py-2.5 text-right">Corrección</th>
                    <th className="px-5 py-2.5">Motivo</th>
                    <th className="px-5 py-2.5">Registrada</th>
                    <th className="px-5 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {correcciones.map((c) => {
                    const anulada = Boolean(c.anulada_at);
                    const cantidad = Number(c.cantidad);
                    return (
                      <tr key={c.id} className={`border-t border-outline-variant ${anulada ? "text-on-surface-variant line-through" : ""}`}>
                        <td className="px-5 py-2.5">
                          <div className="font-medium">{c.producto_nombre}</div>
                          <div className="text-label-sm text-on-surface-variant">{c.producto_ref}</div>
                        </td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-right tabular-nums">
                          {c.tipo === "total" ? `= ${formatQty(cantidad)}` : `${cantidad >= 0 ? "+" : "−"}${formatQty(Math.abs(cantidad))}`}
                        </td>
                        <td className="px-5 py-2.5">{c.motivo}</td>
                        <td className="whitespace-nowrap px-5 py-2.5 text-label-sm text-on-surface-variant">
                          {c.autor ?? "—"} · {new Date(c.created_at).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" })}
                          {anulada && <div className="no-underline">Anulada por {c.anulada_por ?? "—"}</div>}
                        </td>
                        <td className="px-5 py-2.5 text-right">{!anulada && <VoidCorrectionButton id={c.id} nombre={c.producto_nombre} />}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
