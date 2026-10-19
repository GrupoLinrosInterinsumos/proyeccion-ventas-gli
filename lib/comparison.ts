import { query, queryOne } from "./db";
import { periodKey } from "./period";
import { unitForCategoria, type Unit } from "./units";

const SIN_CLIENTE = "Sin cliente registrado";

/** One vendedor · producto · cliente: what was projected for the month and what has sold so far. */
export type ComparisonRow = [
  vendedor: string,
  producto_ref: string,
  partner: string,
  proyectado: number,
  proyectado_usd: number,
  vendido: number,
  vendido_usd: number,
];

export type ComparisonProduct = { n: string; u: Unit; c: string };

export type MonthComparison = {
  period: string;
  rows: ComparisonRow[];
  productos: Record<string, ComparisonProduct>;
  /** Observaciones left on "superó la proyección" clients, keyed `vendedor|producto_ref|partner`. */
  notas: Record<string, string>;
  /** Date (YYYY-MM-DD) up to which the sales data goes; null when there are no sales for the month. */
  hasta: string | null;
  /** When the data was last refreshed (ISO). */
  actualizado: string | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Projection of `period` (client level) against the sales of that same calendar month, for one
 * vendedor or for everyone. Both sides are merged by vendedor + product + client, so a client that
 * sold without being projected (or the reverse) still shows up.
 */
export async function getMonthComparison(period: string, vendedor?: string): Promise<MonthComparison> {
  const scope = vendedor ? ` AND vendedor = $2` : "";
  const params = vendedor ? [period, vendedor] : [period];

  const proj = await query<{
    vendedor: string;
    producto_ref: string;
    producto_nombre: string;
    partner: string;
    cantidad: number;
    precio: number | null;
  }>(
    `SELECT vendedor, producto_ref, producto_nombre, partner, proyeccion_cantidad AS cantidad, precio
     FROM client_projections WHERE period = $1${scope} AND proyeccion_cantidad IS NOT NULL`,
    params
  );
  const sold = await query<{
    vendedor: string;
    producto_ref: string;
    producto_nombre: string;
    partner: string;
    cantidad: number;
    usd: number;
  }>(
    `SELECT vendedor, producto_ref, MAX(producto_nombre) AS producto_nombre,
            COALESCE(NULLIF(TRIM(partner), ''), '${SIN_CLIENTE}') AS partner,
            SUM(cantidad) AS cantidad, SUM(ingreso_soles) AS usd
     FROM sales WHERE period = $1${scope}
     GROUP BY vendedor, producto_ref, COALESCE(NULLIF(TRIM(partner), ''), '${SIN_CLIENTE}')`,
    params
  );
  const categorias = await query<{ producto_ref: string; categoria_n2: string | null }>(
    `SELECT producto_ref, MAX(NULLIF(TRIM(categoria_n2), '')) AS categoria_n2 FROM sales GROUP BY producto_ref`
  );
  const categoriaByRef = new Map(categorias.map((c) => [c.producto_ref, c.categoria_n2]));

  const rows = new Map<string, ComparisonRow>();
  const productos: Record<string, ComparisonProduct> = {};
  const rowFor = (v: string, ref: string, nombre: string, partner: string): ComparisonRow => {
    const key = `${v}|${ref}|${partner}`;
    let row = rows.get(key);
    if (!row) {
      row = [v, ref, partner, 0, 0, 0, 0];
      rows.set(key, row);
    }
    productos[ref] ??= {
      n: nombre,
      u: unitForCategoria(categoriaByRef.get(ref)),
      c: categoriaByRef.get(ref) || "Sin categoría",
    };
    return row;
  };

  for (const p of proj) {
    const row = rowFor(p.vendedor, p.producto_ref, p.producto_nombre, p.partner);
    const qty = Number(p.cantidad);
    row[3] += qty;
    row[4] += p.precio === null ? 0 : qty * (Math.round(Number(p.precio) * 100) / 100);
  }
  for (const s of sold) {
    const row = rowFor(s.vendedor, s.producto_ref, s.producto_nombre, s.partner);
    row[5] += Number(s.cantidad);
    row[6] += Number(s.usd ?? 0);
  }

  const notasRows = await query<{ vendedor: string; producto_ref: string; partner: string; nota: string }>(
    `SELECT vendedor, producto_ref, partner, nota FROM comparison_notes WHERE period = $1${scope}`,
    params
  );
  const notas: Record<string, string> = {};
  for (const n of notasRows) notas[`${n.vendedor}|${n.producto_ref}|${n.partner}`] = n.nota;

  // How current the sales are: the newest import that carried this month.
  const imp = await queryOne<{ data_hasta: string | null; uploaded_at: string }>(
    `SELECT data_hasta::text AS data_hasta,
            to_char(uploaded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS uploaded_at
     FROM imports
     WHERE periods_json LIKE $1 ORDER BY uploaded_at DESC LIMIT 1`,
    [`%"${period}"%`]
  );

  return {
    period,
    rows: [...rows.values()].map(([v, ref, c, pq, pu, rq, ru]) => [v, ref, c, r2(pq), r2(pu), r2(rq), r2(ru)]),
    productos,
    notas,
    hasta: imp?.data_hasta ?? null,
    actualizado: imp?.uploaded_at ?? null,
  };
}

/**
 * How many clients of this vendedor sold above their projection this month without an
 * observación yet — the number shown on the nav's "Comparación" link.
 */
export async function countPendingAlerts(vendedor: string, period: string): Promise<number> {
  const row = await queryOne<{ n: number }>(
    `WITH p AS (
       SELECT producto_ref, partner, SUM(proyeccion_cantidad) AS pq
       FROM client_projections WHERE period = $1 AND vendedor = $2 AND proyeccion_cantidad IS NOT NULL
       GROUP BY producto_ref, partner
     ), s AS (
       SELECT producto_ref, COALESCE(NULLIF(TRIM(partner), ''), '${SIN_CLIENTE}') AS partner, SUM(cantidad) AS rq
       FROM sales WHERE period = $1 AND vendedor = $2
       GROUP BY producto_ref, COALESCE(NULLIF(TRIM(partner), ''), '${SIN_CLIENTE}')
     )
     SELECT COUNT(*)::int AS n FROM p JOIN s ON s.producto_ref = p.producto_ref AND s.partner = p.partner
     WHERE p.pq > 0 AND s.rq > p.pq
       AND NOT EXISTS (
         SELECT 1 FROM comparison_notes n
         WHERE n.period = $1 AND n.vendedor = $2 AND n.producto_ref = p.producto_ref AND n.partner = p.partner
           AND NULLIF(TRIM(n.nota), '') IS NOT NULL
       )`,
    [period, vendedor]
  );
  return Number(row?.n ?? 0);
}

/** The calendar month in Lima (UTC-5), as a period key: the month whose sales are being made now. */
export function currentMonthPeriod(now = new Date()): string {
  const lima = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  return periodKey(lima.getUTCFullYear(), lima.getUTCMonth() + 1);
}
