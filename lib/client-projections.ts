import { query, queryOne } from "./db";
import { closedMonthsForPeriod, periodStatus } from "./period";

function placeholders(count: number, start = 1): string {
  return Array.from({ length: count }, (_, i) => `$${start + i}`).join(",");
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export type ClientProjectionRow = {
  partner: string;
  promedio_mensual: number;
  /** 3-month average revenue (USD) for this client — read-only, from the imported sales. */
  promedio_usd: number;
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

  const avgRows = await query<{ partner: string; cantidad: number; ingreso: number }>(
    `SELECT COALESCE(NULLIF(TRIM(partner), ''), 'Sin cliente registrado') as partner,
            SUM(cantidad) as cantidad, SUM(ingreso_soles) as ingreso
     FROM sales
     WHERE vendedor = $1 AND producto_ref = $2 AND period IN (${placeholders(closed.length, 3)})
     GROUP BY partner`,
    [vendedor, producto_ref, ...closed]
  );

  // Unit price per client (USD): always the "P. Unitario $" column from the import, weighted by
  // quantity over the lines that actually carry a price — never derived from revenue, which on
  // older imports could be in another currency. Uses the most recent closed month the client
  // bought in with a price, not necessarily the single latest month in the 3-month window. A
  // client with no priced sales in the window simply has no default price.
  const priceRows = closed.length
    ? await query<{
        partner: string;
        period: string;
        cantidadConPrecio: number;
        precioPonderado: number;
      }>(
        `SELECT COALESCE(NULLIF(TRIM(partner), ''), 'Sin cliente registrado') as partner, period,
                SUM(CASE WHEN precio_unitario > 0 THEN cantidad ELSE 0 END) as "cantidadConPrecio",
                SUM(precio_unitario * cantidad) as "precioPonderado"
         FROM sales
         WHERE vendedor = $1 AND producto_ref = $2 AND period IN (${placeholders(closed.length, 3)})
         GROUP BY partner, period`,
        [vendedor, producto_ref, ...closed]
      )
    : [];
  const latestPriceByPartner = new Map<string, string>();
  for (const row of priceRows) {
    if (Number(row.cantidadConPrecio) <= 0) continue;
    const latest = latestPriceByPartner.get(row.partner);
    if (!latest || row.period > latest) latestPriceByPartner.set(row.partner, row.period);
  }
  const priceByPartner = new Map<string, number>();
  for (const row of priceRows) {
    if (Number(row.cantidadConPrecio) <= 0) continue;
    if (latestPriceByPartner.get(row.partner) === row.period) {
      priceByPartner.set(row.partner, Number(row.precioPonderado) / Number(row.cantidadConPrecio));
    }
  }

  const savedRows = await query<{
    partner: string;
    proyeccion_cantidad: number | null;
    precio: number | null;
    fijado_hasta: string | null;
    alert_acknowledged: boolean;
    is_manual: boolean;
    untouched: boolean;
  }>(
    `SELECT partner, proyeccion_cantidad, precio, fijado_hasta::text as fijado_hasta, alert_acknowledged,
            (updated_by IS NULL AND fijado_hasta IS NULL) as untouched,
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
  const avgIngresoByPartner = new Map(avgRows.map((r) => [r.partner, Number(r.ingreso)]));
  const denom = Math.max(closed.length, 1);

  const result: ClientProjectionRow[] = [];
  const freshDefaults: { partner: string; proyeccion: number | null; precio: number | null; fijado_hasta: string | null }[] = [];
  let stalePrices = false;
  for (const partner of partners) {
    const promedio = Math.round((avgByPartner.get(partner) ?? 0) / denom);
    const saved = savedByPartner.get(partner);
    const carry = carryByPartner.get(partner);

    const proyeccion =
      saved?.proyeccion_cantidad ?? carry?.proyeccion_cantidad ?? (promedio > 0 ? promedio : null);
    const importedPrecio = priceByPartner.get(partner);
    // A saved row nobody ever edited (system-materialized default, not pinned) always follows
    // the current P. Unitario price — this also replaces defaults saved by the old ingreso/cantidad
    // method. Anything a person typed, or a pinned row, keeps its own value.
    const rawPrecio = saved?.untouched
      ? (importedPrecio ?? null)
      : (saved?.precio ?? carry?.precio ?? importedPrecio ?? null);
    const precio = rawPrecio !== null ? round2(rawPrecio) : null;
    const fijado_hasta = saved?.fijado_hasta ?? carry?.fijado_hasta ?? null;

    if (saved?.untouched && (saved.precio === null ? null : round2(saved.precio)) !== precio) {
      stalePrices = true;
    }

    // Nothing saved for this partner yet this period — the row shown is a computed default.
    // Persist it now so totals/exports/dashboard reflect it without requiring an explicit edit.
    if (!saved && (proyeccion !== null || precio !== null || fijado_hasta !== null)) {
      freshDefaults.push({ partner, proyeccion, precio, fijado_hasta });
    }

    result.push({
      partner,
      promedio_mensual: promedio,
      promedio_usd: (avgIngresoByPartner.get(partner) ?? 0) / denom,
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

  if (stalePrices && periodStatus(period) === "open") {
    await refreshUntouchedPrices(period, vendedor);
  }

  result.sort((a, b) => b.promedio_mensual - a.promedio_mensual);
  return result;
}

/**
 * Re-points every untouched (never edited, not pinned) client price for a vendedor+period at the
 * current P. Unitario price — most recent closed month with a priced sale, weighted by quantity,
 * rounded to cents; NULL when there's none. Fixes defaults saved before prices came only from
 * that column. Dashboard/export revenue reads these stored prices, so this keeps them consistent
 * without needing each product to be opened first.
 */
export async function refreshUntouchedPrices(period: string, vendedor: string): Promise<void> {
  const closed = closedMonthsForPeriod(period);
  if (closed.length === 0) return;
  await query(
    `UPDATE client_projections cp
     SET precio = p.precio, updated_at = now()
     FROM (
       SELECT cp2.id,
              (SELECT ROUND((pp.pond / pp.qty)::numeric, 2)::double precision
               FROM (
                 SELECT s.period,
                        SUM(s.precio_unitario * s.cantidad) AS pond,
                        SUM(CASE WHEN s.precio_unitario > 0 THEN s.cantidad ELSE 0 END) AS qty
                 FROM sales s
                 WHERE s.vendedor = cp2.vendedor AND s.producto_ref = cp2.producto_ref
                   AND COALESCE(NULLIF(TRIM(s.partner), ''), 'Sin cliente registrado') = cp2.partner
                   AND s.period IN (${placeholders(closed.length, 3)})
                 GROUP BY s.period
                 HAVING SUM(CASE WHEN s.precio_unitario > 0 THEN s.cantidad ELSE 0 END) > 0
                 ORDER BY s.period DESC
                 LIMIT 1
               ) pp) AS precio
       FROM client_projections cp2
       WHERE cp2.period = $1 AND cp2.vendedor = $2 AND cp2.updated_by IS NULL AND cp2.fijado_hasta IS NULL
     ) p
     WHERE cp.id = p.id AND cp.precio IS DISTINCT FROM p.precio`,
    [period, vendedor, ...closed]
  );
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

/** True if this partner has no real sales history under this vendedor+producto — i.e. it was
 * added manually via "+ Agregar cliente" rather than coming from an Excel import. */
export async function isClientManual(vendedor: string, producto_ref: string, partner: string): Promise<boolean> {
  const row = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM sales
       WHERE vendedor = $1 AND producto_ref = $2
         AND COALESCE(NULLIF(TRIM(partner), ''), 'Sin cliente registrado') = $3
     ) as exists`,
    [vendedor, producto_ref, partner]
  );
  return !row?.exists;
}

/** Removes a manually-added client row and re-syncs the product-level total. Callers must
 * verify with isClientManual() first — this does not re-check. */
export async function deleteClientProjection(params: {
  period: string;
  vendedor: string;
  producto_ref: string;
  producto_nombre: string;
  partner: string;
  updatedBy: number;
}): Promise<void> {
  await query(
    `DELETE FROM client_projections WHERE period = $1 AND vendedor = $2 AND producto_ref = $3 AND partner = $4`,
    [params.period, params.vendedor, params.producto_ref, params.partner]
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
 * Creates the default projection of every vendedor for the open period in one set-based pass:
 * each client's proyección is their 3-month average (rounded), their price the latest P. Unitario
 * they had, and each product's proyección the sum of its clients. A still-pinned "fijado" row from
 * an earlier period carries over first. Existing rows — anything edited, pinned, or already
 * materialized — are never overwritten, so dashboard totals no longer depend on whose page was
 * opened. `rebuild` first drops the untouched (never edited, not pinned) defaults so they follow
 * freshly imported sales, e.g. right after uploading a report.
 */
export async function ensureOpenPeriodDefaults(period: string, opts: { rebuild?: boolean } = {}): Promise<void> {
  if (periodStatus(period) !== "open") return;
  const closed = closedMonthsForPeriod(period);
  if (closed.length === 0) return;
  const inClosed = placeholders(closed.length, 2);
  const denom = Math.max(closed.length, 1);

  if (!opts.rebuild) {
    // Cheap guard: nothing to do once every vendedor with recent sales already has projections.
    const missing = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM (
         SELECT DISTINCT vendedor FROM sales WHERE period IN (${inClosed})
         EXCEPT
         SELECT DISTINCT vendedor FROM projections WHERE period = $1
       ) m`,
      [period, ...closed]
    );
    if (!missing || missing.n === 0) return;
  } else {
    await query(
      `DELETE FROM client_projections WHERE period = $1 AND updated_by IS NULL AND fijado_hasta IS NULL`,
      [period]
    );
  }

  // 1. Pinned clients from earlier periods keep their pinned values.
  await query(
    `INSERT INTO client_projections
       (period, vendedor, producto_ref, producto_nombre, partner, proyeccion_cantidad, precio, fijado_hasta, updated_at)
     SELECT DISTINCT ON (vendedor, producto_ref, partner)
            $1::text, vendedor, producto_ref, producto_nombre, partner, proyeccion_cantidad, precio, fijado_hasta, now()
     FROM client_projections
     WHERE period < $1 AND fijado_hasta IS NOT NULL AND fijado_hasta >= $2::date
     ORDER BY vendedor, producto_ref, partner, updated_at DESC
     ON CONFLICT (period, vendedor, producto_ref, partner) DO NOTHING`,
    [period, `${period}-01`]
  );

  // 2. Everyone else: 3-month average quantity, latest priced P. Unitario.
  await query(
    `WITH s AS (
       SELECT vendedor, producto_ref, producto_nombre, period, precio_unitario, cantidad,
              COALESCE(NULLIF(TRIM(partner), ''), 'Sin cliente registrado') AS partner
       FROM sales WHERE period IN (${inClosed})
     ), base AS (
       SELECT vendedor, producto_ref, partner, MAX(producto_nombre) AS producto_nombre, SUM(cantidad) AS qty
       FROM s GROUP BY vendedor, producto_ref, partner
     ), per AS (
       SELECT vendedor, producto_ref, partner, period,
              SUM(precio_unitario * cantidad) AS pond,
              SUM(CASE WHEN precio_unitario > 0 THEN cantidad ELSE 0 END) AS pq
       FROM s GROUP BY vendedor, producto_ref, partner, period
       HAVING SUM(CASE WHEN precio_unitario > 0 THEN cantidad ELSE 0 END) > 0
     ), pr AS (
       SELECT DISTINCT ON (vendedor, producto_ref, partner) vendedor, producto_ref, partner,
              ROUND((pond / pq)::numeric, 2)::double precision AS precio
       FROM per ORDER BY vendedor, producto_ref, partner, period DESC
     )
     INSERT INTO client_projections
       (period, vendedor, producto_ref, producto_nombre, partner, proyeccion_cantidad, precio, updated_at)
     SELECT $1::text, b.vendedor, b.producto_ref, b.producto_nombre, b.partner,
            ROUND((b.qty / ${denom})::numeric)::double precision, pr.precio, now()
     FROM base b LEFT JOIN pr USING (vendedor, producto_ref, partner)
     WHERE ROUND((b.qty / ${denom})::numeric) > 0
     ON CONFLICT (period, vendedor, producto_ref, partner) DO NOTHING`,
    [period, ...closed]
  );

  // 3. Each product's proyección is the sum of its clients.
  await query(
    `INSERT INTO projections (period, vendedor, producto_ref, producto_nombre, proyeccion, is_manual, updated_at)
     SELECT period, vendedor, producto_ref, MAX(producto_nombre), SUM(proyeccion_cantidad), FALSE, now()
     FROM client_projections WHERE period = $1
     GROUP BY period, vendedor, producto_ref
     ON CONFLICT (period, vendedor, producto_ref) DO UPDATE SET
       proyeccion = excluded.proyeccion, updated_at = now()
     WHERE projections.proyeccion IS DISTINCT FROM excluded.proyeccion`,
    [period]
  );

  if (opts.rebuild) {
    // Drop product rows that only existed as a system default and no longer have any client or
    // sales behind them (e.g. a product missing from the freshly imported report).
    await query(
      `DELETE FROM projections p
       WHERE p.period = $1 AND p.is_manual = FALSE AND p.updated_by IS NULL AND p.observaciones IS NULL
         AND NOT EXISTS (SELECT 1 FROM client_projections c
                         WHERE c.period = p.period AND c.vendedor = p.vendedor AND c.producto_ref = p.producto_ref)
         AND NOT EXISTS (SELECT 1 FROM sales s
                         WHERE s.vendedor = p.vendedor AND s.producto_ref = p.producto_ref
                           AND s.period IN (${placeholders(closed.length, 2)}))`,
      [period, ...closed]
    );
  }
}
