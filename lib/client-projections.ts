import { query, queryOne } from "./db";
import { closedMonthsForPeriod, periodStatus } from "./period";

function placeholders(count: number, start = 1): string {
  return Array.from({ length: count }, (_, i) => `$${start + i}`).join(",");
}

export type ClientProjectionRow = {
  partner: string;
  promedio_mensual: number;
  proyeccion: number | null;
  precio: number | null;
  total: number;
  fijado_hasta: string | null;
  alert_acknowledged: boolean;
  is_manual: boolean;
};

/**
 * Per-client rows for one vendedor+producto+period: 3-month average quantity, an editable
 * proyección (defaults to the average), an editable price (defaults to last closed month's
 * unit price for that client), and their product = the revenue projection. A still-active
 * "fijado" (pinned) row from an earlier period carries its values forward automatically.
 */
export async function getClientProjections(
  vendedor: string,
  producto_ref: string,
  period: string
): Promise<ClientProjectionRow[]> {
  const closed = closedMonthsForPeriod(period);

  const avgRows = await query<{ partner: string; cantidad: number }>(
    `SELECT COALESCE(NULLIF(TRIM(partner), ''), 'Sin cliente registrado') as partner, SUM(cantidad) as cantidad
     FROM sales
     WHERE vendedor = $1 AND producto_ref = $2 AND period IN (${placeholders(closed.length, 3)})
     GROUP BY partner`,
    [vendedor, producto_ref, ...closed]
  );

  // Unit price per client: prefer the most recent closed month they actually bought in — not
  // necessarily the single latest month, since a client may skip a month within the 3-month window.
  const priceRows = closed.length
    ? await query<{ partner: string; period: string; cantidad: number; ingreso: number }>(
        `SELECT COALESCE(NULLIF(TRIM(partner), ''), 'Sin cliente registrado') as partner, period,
                SUM(cantidad) as cantidad, SUM(ingreso_soles) as ingreso
         FROM sales
         WHERE vendedor = $1 AND producto_ref = $2 AND period IN (${placeholders(closed.length, 3)})
         GROUP BY partner, period`,
        [vendedor, producto_ref, ...closed]
      )
    : [];
  const latestPriceByPartner = new Map<string, string>();
  for (const row of priceRows) {
    if (Number(row.cantidad) <= 0) continue;
    const latest = latestPriceByPartner.get(row.partner);
    if (!latest || row.period > latest) latestPriceByPartner.set(row.partner, row.period);
  }
  const priceByPartner = new Map<string, number>();
  for (const row of priceRows) {
    if (Number(row.cantidad) <= 0) continue;
    if (latestPriceByPartner.get(row.partner) === row.period) {
      priceByPartner.set(row.partner, Number(row.ingreso) / Number(row.cantidad));
    }
  }

  const savedRows = await query<{
    partner: string;
    proyeccion_cantidad: number | null;
    precio: number | null;
    fijado_hasta: string | null;
    alert_acknowledged: boolean;
    is_manual: boolean;
  }>(
    `SELECT partner, proyeccion_cantidad, precio, fijado_hasta::text as fijado_hasta, alert_acknowledged,
            (partner NOT IN (SELECT DISTINCT COALESCE(NULLIF(TRIM(partner), ''), 'Sin cliente registrado')
                              FROM sales WHERE vendedor = $1 AND producto_ref = $2)) as is_manual
     FROM client_projections WHERE vendedor = $1 AND producto_ref = $2 AND period = $3`,
    [vendedor, producto_ref, period]
  );
  const savedByPartner = new Map(savedRows.map((r) => [r.partner, r]));

  // A still-active "fijado" row from an earlier period, used as a fallback default when this
  // period has no row of its own yet.
  const firstOfPeriod = `${period}-01`;
  const carryRows = await query<{ partner: string; proyeccion_cantidad: number | null; precio: number | null; fijado_hasta: string | null }>(
    `SELECT DISTINCT ON (partner) partner, proyeccion_cantidad, precio, fijado_hasta::text as fijado_hasta
     FROM client_projections
     WHERE vendedor = $1 AND producto_ref = $2 AND fijado_hasta IS NOT NULL AND fijado_hasta >= $3::date
     ORDER BY partner, updated_at DESC`,
    [vendedor, producto_ref, firstOfPeriod]
  );
  const carryByPartner = new Map(carryRows.map((r) => [r.partner, r]));

  const partners = new Set<string>([...avgRows.map((r) => r.partner), ...savedByPartner.keys()]);
  const avgByPartner = new Map(avgRows.map((r) => [r.partner, Number(r.cantidad)]));
  const denom = Math.max(closed.length, 1);

  const result: ClientProjectionRow[] = [];
  const freshDefaults: { partner: string; proyeccion: number | null; precio: number | null; fijado_hasta: string | null }[] = [];
  for (const partner of partners) {
    const promedio = Math.round((avgByPartner.get(partner) ?? 0) / denom);
    const saved = savedByPartner.get(partner);
    const carry = carryByPartner.get(partner);

    const proyeccion =
      saved?.proyeccion_cantidad ?? carry?.proyeccion_cantidad ?? (promedio > 0 ? promedio : null);
    const precio = saved?.precio ?? carry?.precio ?? priceByPartner.get(partner) ?? null;
    const fijado_hasta = saved?.fijado_hasta ?? carry?.fijado_hasta ?? null;

    // Nothing saved for this partner yet this period — the row shown is a computed default.
    // Persist it now so totals/exports/dashboard reflect it without requiring an explicit edit.
    if (!saved && (proyeccion !== null || precio !== null || fijado_hasta !== null)) {
      freshDefaults.push({ partner, proyeccion, precio, fijado_hasta });
    }

    result.push({
      partner,
      promedio_mensual: promedio,
      proyeccion,
      precio,
      total: proyeccion != null && precio != null ? proyeccion * precio : 0,
      fijado_hasta,
      alert_acknowledged: saved?.alert_acknowledged ?? false,
      is_manual: saved?.is_manual ?? promedio === 0,
    });
  }

  if (freshDefaults.length > 0 && periodStatus(period) === "open") {
    const nameRow =
      (await queryOne<{ producto_nombre: string }>(
        `SELECT producto_nombre FROM sales WHERE vendedor = $1 AND producto_ref = $2 LIMIT 1`,
        [vendedor, producto_ref]
      )) ??
      (await queryOne<{ producto_nombre: string }>(
        `SELECT producto_nombre FROM projections WHERE vendedor = $1 AND producto_ref = $2 LIMIT 1`,
        [vendedor, producto_ref]
      ));
    const producto_nombre = nameRow?.producto_nombre ?? producto_ref;
    await materializeClientDefaults(period, vendedor, producto_ref, producto_nombre, freshDefaults);
  }

  result.sort((a, b) => b.promedio_mensual - a.promedio_mensual);
  return result;
}

/** Persists computed default rows (never explicitly saved) so they become real, queryable data. */
async function materializeClientDefaults(
  period: string,
  vendedor: string,
  producto_ref: string,
  producto_nombre: string,
  defaults: { partner: string; proyeccion: number | null; precio: number | null; fijado_hasta: string | null }[]
): Promise<void> {
  const params: unknown[] = [period, vendedor, producto_ref, producto_nombre];
  const tuples: string[] = [];
  for (const d of defaults) {
    const base = params.length;
    tuples.push(`($1,$2,$3,$4,$${base + 1},$${base + 2},$${base + 3},$${base + 4},now())`);
    params.push(d.partner, d.proyeccion, d.precio, d.fijado_hasta);
  }

  await query(
    `INSERT INTO client_projections
       (period, vendedor, producto_ref, producto_nombre, partner, proyeccion_cantidad, precio, fijado_hasta, updated_at)
     VALUES ${tuples.join(",")}
     ON CONFLICT (period, vendedor, producto_ref, partner) DO NOTHING`,
    params
  );

  await syncProductProjectionFromClients(period, vendedor, producto_ref, producto_nombre, null);
}

export async function saveClientProjection(params: {
  period: string;
  vendedor: string;
  producto_ref: string;
  producto_nombre: string;
  partner: string;
  proyeccion: number | null;
  precio: number | null;
  fijado_hasta: string | null;
  alertAcknowledged?: boolean;
  updatedBy: number;
}): Promise<void> {
  await query(
    `INSERT INTO client_projections
       (period, vendedor, producto_ref, producto_nombre, partner, proyeccion_cantidad, precio, fijado_hasta, alert_acknowledged, updated_by, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9, FALSE),$10,now())
     ON CONFLICT (period, vendedor, producto_ref, partner) DO UPDATE SET
       proyeccion_cantidad = excluded.proyeccion_cantidad,
       precio = excluded.precio,
       fijado_hasta = excluded.fijado_hasta,
       alert_acknowledged = CASE WHEN $9 IS NULL THEN client_projections.alert_acknowledged ELSE excluded.alert_acknowledged END,
       producto_nombre = excluded.producto_nombre,
       updated_by = excluded.updated_by,
       updated_at = now()`,
    [
      params.period,
      params.vendedor,
      params.producto_ref,
      params.producto_nombre,
      params.partner,
      params.proyeccion,
      params.precio,
      params.fijado_hasta,
      params.alertAcknowledged ?? null,
      params.updatedBy,
    ]
  );

  await syncProductProjectionFromClients(
    params.period,
    params.vendedor,
    params.producto_ref,
    params.producto_nombre,
    params.updatedBy
  );
}

/**
 * The product-level proyección (in `projections`) is the sum of its client-level proyecciones —
 * recomputed here after every client edit so it never drifts out of sync.
 */
async function syncProductProjectionFromClients(
  period: string,
  vendedor: string,
  producto_ref: string,
  producto_nombre: string,
  updatedBy: number | null
): Promise<void> {
  const sum = await query<{ total: number | null }>(
    `SELECT SUM(proyeccion_cantidad) as total FROM client_projections
     WHERE period = $1 AND vendedor = $2 AND producto_ref = $3`,
    [period, vendedor, producto_ref]
  );
  const total = Number(sum[0]?.total ?? 0);

  await query(
    `INSERT INTO projections (period, vendedor, producto_ref, producto_nombre, proyeccion, is_manual, updated_by, updated_at)
     VALUES ($1,$2,$3,$4,$5,FALSE,$6,now())
     ON CONFLICT (period, vendedor, producto_ref) DO UPDATE SET
       proyeccion = excluded.proyeccion,
       producto_nombre = excluded.producto_nombre,
       updated_by = excluded.updated_by,
       updated_at = now()`,
    [period, vendedor, producto_ref, producto_nombre, total, updatedBy]
  );
}
