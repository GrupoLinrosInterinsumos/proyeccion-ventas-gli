import { query } from "./db";
import { currentMonthPeriod } from "./comparison";
import { periodLabel } from "./period";
import { unitForCategoria, type Unit } from "./units";

export type Distribucion = {
  id: number;
  producto_ref: string;
  producto_nombre: string;
  unidad: Unit;
  partner: string;
  cantidad: number;
  /** Last month (YYYY-MM) the distribution applies to — valid through the end of that month. */
  hasta_mes: string;
  /** ISO timestamp of the last change. */
  actualizado: string;
};

/** Every distribution, newest product names first-alphabetical; the page groups and filters them. */
export async function listDistribuciones(): Promise<Distribucion[]> {
  const rows = await query<{
    id: number;
    producto_ref: string;
    producto_nombre: string;
    partner: string;
    cantidad: number;
    hasta_mes: string;
    categoria_n2: string | null;
    actualizado: string;
  }>(
    `SELECT d.id, d.producto_ref, d.producto_nombre, d.partner, d.cantidad, d.hasta_mes, c.categoria_n2,
            to_char(d.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS actualizado
     FROM distribuciones d
     LEFT JOIN (
       SELECT producto_ref, MAX(NULLIF(TRIM(categoria_n2), '')) AS categoria_n2 FROM sales GROUP BY producto_ref
     ) c ON c.producto_ref = d.producto_ref
     ORDER BY d.producto_nombre, d.partner`
  );
  return rows.map((r) => ({
    id: r.id,
    producto_ref: r.producto_ref,
    producto_nombre: r.producto_nombre,
    unidad: unitForCategoria(r.categoria_n2),
    partner: r.partner,
    cantidad: Number(r.cantidad),
    hasta_mes: r.hasta_mes,
    actualizado: r.actualizado,
  }));
}

/** The current month and the next `count - 1`, as options for "hasta qué mes". */
export function mesesDisponibles(count = 18, now = new Date()): { value: string; label: string }[] {
  const [y, m] = currentMonthPeriod(now).split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const z = y * 12 + (m - 1) + i;
    const value = `${Math.floor(z / 12)}-${String((z % 12) + 1).padStart(2, "0")}`;
    return { value, label: periodLabel(value) };
  });
}
