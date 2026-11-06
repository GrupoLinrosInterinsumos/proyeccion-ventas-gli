import { query } from "./db";
import { unitForCategoria, type Unit } from "./units";

/** Who sells to a client: a vendedor and the sales team ("Equipo Vendedor") they belong to. */
export type VendedorCliente = { vendedor: string; equipo: string };

/** One adjusted quantity (from the comparison page): what a client gets of a product in a month. */
export type Distribucion = {
  id: number;
  producto_ref: string;
  producto_nombre: string;
  unidad: Unit;
  partner: string;
  cantidad: number;
  /** The month (YYYY-MM) the adjustment belongs to. */
  mes: string;
  /** ISO timestamp of the last change. */
  actualizado: string;
  /** The vendedor whose projection was adjusted, and their sales team. */
  vendedor: string;
  equipo: string;
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

/** Every adjustment the admin has set, with the team of its vendedor; the page groups and filters them. */
export async function listDistribuciones(): Promise<Distribucion[]> {
  const rows = await query<{
    id: number;
    producto_ref: string;
    producto_nombre: string;
    vendedor: string;
    partner: string;
    cantidad: number;
    mes: string;
    categoria_n2: string | null;
    equipo: string | null;
    actualizado: string;
  }>(
    `SELECT a.id, a.producto_ref, a.producto_nombre, a.vendedor, a.partner, a.cantidad, a.period AS mes,
            c.categoria_n2, e.equipo,
            to_char(a.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS actualizado
     FROM ajustes_proyeccion a
     LEFT JOIN (
       SELECT producto_ref, MAX(NULLIF(TRIM(categoria_n2), '')) AS categoria_n2 FROM sales GROUP BY producto_ref
     ) c ON c.producto_ref = a.producto_ref
     LEFT JOIN (
       SELECT vendedor, MAX(region) AS equipo FROM (
         SELECT vendedor, region FROM users WHERE vendedor IS NOT NULL AND region IS NOT NULL
         UNION ALL SELECT vendedor, region FROM sales WHERE region IS NOT NULL
       ) t GROUP BY vendedor
     ) e ON e.vendedor = a.vendedor
     ORDER BY a.producto_nombre, a.period, a.partner`
  );
  return rows.map((r) => ({
    id: r.id,
    producto_ref: r.producto_ref,
    producto_nombre: r.producto_nombre,
    unidad: unitForCategoria(r.categoria_n2),
    partner: r.partner,
    cantidad: Number(r.cantidad),
    mes: r.mes,
    actualizado: r.actualizado,
    vendedor: r.vendedor,
    equipo: r.equipo ?? "",
  }));
}
