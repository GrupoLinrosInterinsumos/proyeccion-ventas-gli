import { query } from "./db";
import { currentMonthPeriod } from "./comparison";
import { periodLabel } from "./period";
import { unitForCategoria, type Unit } from "./units";

/** Who sells to a client: a vendedor and the sales team ("Equipo Vendedor") they belong to. */
export type VendedorCliente = { vendedor: string; equipo: string };

export type Distribucion = {
  id: number;
  producto_ref: string;
  producto_nombre: string;
  unidad: Unit;
  partner: string;
  cantidad: number;
  /** The month (YYYY-MM) this amount is distributed in. */
  mes: string;
  /** ISO timestamp of the last change. */
  actualizado: string;
  /** Vendedores that sell to this client, most recent first (empty for a client with no sales). */
  vendedores: VendedorCliente[];
};

const SIN_CLIENTE = "Sin cliente registrado";

/**
 * The vendedor(es) and team of each client, from their sales: the one that sold to them most recently
 * first, ties broken by quantity. A client with no sales has no entry.
 */
export async function vendedoresDeClientes(partners: string[]): Promise<Map<string, VendedorCliente[]>> {
  const result = new Map<string, VendedorCliente[]>();
  if (partners.length === 0) return result;
  const rows = await query<{ partner: string; vendedor: string; equipo: string }>(
    `SELECT COALESCE(NULLIF(TRIM(partner), ''), '${SIN_CLIENTE}') AS partner, vendedor, region AS equipo
     FROM sales
     WHERE COALESCE(NULLIF(TRIM(partner), ''), '${SIN_CLIENTE}') = ANY($1::text[])
     GROUP BY 1, vendedor, region
     ORDER BY MAX(period) DESC, SUM(cantidad) DESC, vendedor`,
    [partners]
  );
  for (const r of rows) {
    const lista = result.get(r.partner) ?? [];
    lista.push({ vendedor: r.vendedor, equipo: r.equipo });
    result.set(r.partner, lista);
  }
  return result;
}

/** Every distribution, newest product names first-alphabetical; the page groups and filters them. */
export async function listDistribuciones(): Promise<Distribucion[]> {
  const rows = await query<{
    id: number;
    producto_ref: string;
    producto_nombre: string;
    partner: string;
    cantidad: number;
    mes: string;
    categoria_n2: string | null;
    actualizado: string;
  }>(
    `SELECT d.id, d.producto_ref, d.producto_nombre, d.partner, d.cantidad, d.mes, c.categoria_n2,
            to_char(d.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS actualizado
     FROM distribuciones d
     LEFT JOIN (
       SELECT producto_ref, MAX(NULLIF(TRIM(categoria_n2), '')) AS categoria_n2 FROM sales GROUP BY producto_ref
     ) c ON c.producto_ref = d.producto_ref
     ORDER BY d.producto_nombre, d.mes, d.partner`
  );
  const vendedores = await vendedoresDeClientes([...new Set(rows.map((r) => r.partner))]);
  return rows.map((r) => ({
    id: r.id,
    producto_ref: r.producto_ref,
    producto_nombre: r.producto_nombre,
    unidad: unitForCategoria(r.categoria_n2),
    partner: r.partner,
    cantidad: Number(r.cantidad),
    mes: r.mes,
    actualizado: r.actualizado,
    vendedores: vendedores.get(r.partner) ?? [],
  }));
}

/** The current month and the next `count - 1`, as options for the month of a distribution. */
export function mesesDisponibles(count = 18, now = new Date()): { value: string; label: string }[] {
  const [y, m] = currentMonthPeriod(now).split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const z = y * 12 + (m - 1) + i;
    const value = `${Math.floor(z / 12)}-${String((z % 12) + 1).padStart(2, "0")}`;
    return { value, label: periodLabel(value) };
  });
}
