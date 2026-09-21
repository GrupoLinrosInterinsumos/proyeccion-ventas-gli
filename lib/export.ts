import { query } from "./db";
import { listUsers } from "./users";
import { getVendorProductTable, getFullCatalogProductTable } from "./sales";
import { unitForCategoria, type Unit } from "./units";

export type ProjectionExportRow = {
  vendedor: string;
  sede: string;
  producto: string;
  cantidad: number;
  unidad: Unit;
  fijado: string;
};

/**
 * One row per (vendedor, producto) with a proyección for the period — every product a vendedor
 * has, whether or not they've explicitly touched it (untouched ones default to their historical
 * average, same as what they'd see on their own page) — plus whether any client under that
 * product is "fijado" (pinned) and until when.
 */
export async function getProjectionExportRows(period: string): Promise<ProjectionExportRow[]> {
  const users = await listUsers();
  const vendedores = users.filter((u): u is typeof u & { vendedor: string } => !!u.vendedor);

  const fijadoRows = await query<{ vendedor: string; producto_ref: string; fijado_hasta: string }>(
    `SELECT vendedor, producto_ref, MAX(fijado_hasta)::text as fijado_hasta
     FROM client_projections
     WHERE period = $1 AND fijado_hasta IS NOT NULL
     GROUP BY vendedor, producto_ref`,
    [period]
  );
  const fijadoByKey = new Map(fijadoRows.map((r) => [`${r.vendedor}::${r.producto_ref}`, r.fijado_hasta]));

  const perVendedor = await Promise.all(
    vendedores.map(async (u) => {
      const rows = u.is_spot
        ? await getFullCatalogProductTable(u.vendedor, period)
        : await getVendorProductTable(u.vendedor, period);
      return rows
        .filter((row) => row.proyeccion !== null)
        .map((row): ProjectionExportRow => {
          const fijado = fijadoByKey.get(`${u.vendedor}::${row.producto_ref}`);
          return {
            vendedor: u.vendedor,
            sede: u.region ?? "",
            producto: row.producto_nombre,
            cantidad: row.proyeccion as number,
            unidad: unitForCategoria(row.categoria_n2),
            fijado: fijado ? `Fijado hasta ${fijado}` : "No fijado",
          };
        });
    })
  );

  return perVendedor
    .flat()
    .sort((a, b) => a.vendedor.localeCompare(b.vendedor, "es") || a.producto.localeCompare(b.producto, "es"));
}

export type ProjectionExportProductSummaryRow = {
  producto: string;
  unidad: Unit;
  cantidad_total: number;
  vendedores: string;
};

/** Groups export rows by producto — total proyectado and which vendedores contribute to it. */
export function summarizeExportByProduct(rows: ProjectionExportRow[]): ProjectionExportProductSummaryRow[] {
  const byProduct = new Map<string, { unidad: Unit; cantidad_total: number; vendedores: Set<string> }>();
  for (const r of rows) {
    const entry = byProduct.get(r.producto) ?? { unidad: r.unidad, cantidad_total: 0, vendedores: new Set<string>() };
    entry.cantidad_total += r.cantidad;
    entry.vendedores.add(r.vendedor);
    byProduct.set(r.producto, entry);
  }
  return [...byProduct.entries()]
    .map(([producto, v]) => ({
      producto,
      unidad: v.unidad,
      cantidad_total: v.cantidad_total,
      vendedores: [...v.vendedores].sort((a, b) => a.localeCompare(b, "es")).join(", "),
    }))
    .sort((a, b) => b.cantidad_total - a.cantidad_total);
}
