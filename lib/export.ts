import { query } from "./db";

export type ProjectionExportRow = {
  vendedor: string;
  sede: string;
  producto: string;
  cantidad: number;
  fijado: string;
};

/**
 * One row per (vendedor, producto) with a proyección set for the period, plus whether any
 * client under that product is "fijado" (pinned) and until when.
 */
export async function getProjectionExportRows(period: string): Promise<ProjectionExportRow[]> {
  const rows = await query<{
    vendedor: string;
    region: string | null;
    producto_nombre: string;
    proyeccion: number;
    fijado_hasta: string | null;
  }>(
    `SELECT p.vendedor, u.region, p.producto_nombre, p.proyeccion,
            (SELECT MAX(cp.fijado_hasta)::text FROM client_projections cp
             WHERE cp.vendedor = p.vendedor AND cp.producto_ref = p.producto_ref
               AND cp.period = p.period AND cp.fijado_hasta IS NOT NULL) as fijado_hasta
     FROM projections p
     LEFT JOIN users u ON u.vendedor = p.vendedor
     WHERE p.period = $1 AND p.proyeccion IS NOT NULL
     ORDER BY p.vendedor, p.producto_nombre`,
    [period]
  );

  return rows.map((r) => ({
    vendedor: r.vendedor,
    sede: r.region ?? "",
    producto: r.producto_nombre,
    cantidad: Number(r.proyeccion),
    fijado: r.fijado_hasta ? `Fijado hasta ${r.fijado_hasta}` : "No fijado",
  }));
}
