import { query, queryOne } from "./db";
import { closedMonthsForPeriod, periodStatus } from "./period";
import { productFamilyKey, parseSizeGrams } from "./product-family";
import { refreshUntouchedPrices } from "./client-projections";
import { saccoCondition, isExcedido, unitForCategoria, emptyQty, addQty, type QtySplit, type Unit } from "./units";
import type { Region } from "./regions";

function placeholders(count: number, start = 1): string {
  return Array.from({ length: count }, (_, i) => `$${start + i}`).join(",");
}

async function uploadedPeriodsCount(periods: string[]): Promise<number> {
  if (periods.length === 0) return 0;
  const rows = await query<{ period: string }>(
    `SELECT DISTINCT period FROM sales WHERE period IN (${placeholders(periods.length)})`,
    periods
  );
  return rows.length;
}

export type CatalogProduct = { producto_ref: string; producto_nombre: string; categoria_n2: string | null };

/** Every distinct product that has ever been sold — the list offered when adding a product. */
export async function listCatalogProducts(): Promise<CatalogProduct[]> {
  return query<CatalogProduct>(
    `SELECT producto_ref, MAX(producto_nombre) AS producto_nombre, MAX(NULLIF(categoria_n2, '')) AS categoria_n2
     FROM sales GROUP BY producto_ref ORDER BY MAX(producto_nombre)`
  );
}

export type ProductRow = {
  producto_ref: string;
  producto_nombre: string;
  categoria_n2: string | null;
  cantidad_total: number;
  promedio_mensual: number;
  /** 3-month average revenue (USD) — read-only, from the imported sales. */
  promedio_usd: number;
  proyeccion: number | null;
  ingreso_proyectado: number;
  observaciones: string | null;
  is_manual: boolean;
};

/** Per producto_ref: sum of proyección × precio across its clients (USD), for one vendedor+period. */
async function revenueByProduct(period: string, vendedor: string): Promise<Map<string, number>> {
  const rows = await query<{ producto_ref: string; total: number }>(
    `SELECT producto_ref, SUM(proyeccion_cantidad * ROUND(precio::numeric, 2)::double precision) as total
     FROM client_projections
     WHERE period = $1 AND vendedor = $2 AND proyeccion_cantidad IS NOT NULL AND precio IS NOT NULL
     GROUP BY producto_ref`,
    [period, vendedor]
  );
  return new Map(rows.map((r) => [r.producto_ref, Number(r.total)]));
}

/** Per producto_ref: sum of client-level proyección quantities, for one vendedor+period. */
async function clientQtySumByProduct(period: string, vendedor: string): Promise<Map<string, number>> {
  const rows = await query<{ producto_ref: string; total: number }>(
    `SELECT producto_ref, SUM(proyeccion_cantidad) as total
     FROM client_projections
     WHERE period = $1 AND vendedor = $2
     GROUP BY producto_ref`,
    [period, vendedor]
  );
  return new Map(rows.map((r) => [r.producto_ref, Number(r.total)]));
}

/** Flat, ordered (desc by 3-month avg) product table for a single vendedor. */
export async function getVendorProductTable(
  vendedor: string,
  projectionPeriod: string
): Promise<ProductRow[]> {
  const closed = closedMonthsForPeriod(projectionPeriod);
  const denom = Math.max(await uploadedPeriodsCount(closed), 1);

  const salesRows = await query<{
    producto_ref: string;
    producto_nombre: string;
    categoria_n2: string | null;
    total: number;
    ingreso: number;
  }>(
    `SELECT producto_ref, MAX(producto_nombre) as producto_nombre,
            MAX(NULLIF(categoria_n2, '')) as categoria_n2, SUM(cantidad) as total,
            SUM(ingreso_soles) as ingreso
     FROM sales
     WHERE vendedor = $1 AND period IN (${placeholders(closed.length, 2)})
     GROUP BY producto_ref`,
    [vendedor, ...closed]
  );

  const projRows = await query<{
    producto_ref: string;
    producto_nombre: string;
    proyeccion: number | null;
    observaciones: string | null;
    is_manual: boolean;
  }>(
    `SELECT producto_ref, producto_nombre, proyeccion, observaciones, is_manual
     FROM projections WHERE vendedor = $1 AND period = $2`,
    [vendedor, projectionPeriod]
  );
  if (periodStatus(projectionPeriod) === "open") await refreshUntouchedPrices(projectionPeriod, vendedor);
  const revenueByRef = await revenueByProduct(projectionPeriod, vendedor);
  const clientQtyByRef = await clientQtySumByProduct(projectionPeriod, vendedor);

  const projByRef = new Map(projRows.map((p) => [p.producto_ref, p]));
  const rows: ProductRow[] = [];
  // Products whose stored proyección disagrees with the fresh client-level sum — happens only
  // from data saved before that sum became the rule. Corrected below so it doesn't linger.
  const corrections: { producto_ref: string; producto_nombre: string; proyeccion: number }[] = [];

  for (const row of salesRows) {
    const proj = projByRef.get(row.producto_ref);
    projByRef.delete(row.producto_ref);
    const storedProyeccion = proj?.proyeccion != null ? Number(proj.proyeccion) : null;
    const clientSum = clientQtyByRef.get(row.producto_ref);
    if (clientSum !== undefined && clientSum !== storedProyeccion) {
      corrections.push({ producto_ref: row.producto_ref, producto_nombre: row.producto_nombre, proyeccion: clientSum });
    }
    rows.push({
      producto_ref: row.producto_ref,
      producto_nombre: row.producto_nombre,
      categoria_n2: row.categoria_n2,
      cantidad_total: Number(row.total),
      promedio_mensual: Number(row.total) / denom,
      promedio_usd: Number(row.ingreso) / denom,
      proyeccion: clientSum !== undefined ? clientSum : storedProyeccion,
      ingreso_proyectado: revenueByRef.get(row.producto_ref) ?? 0,
      observaciones: proj?.observaciones ?? null,
      is_manual: false,
    });
  }

  // Remaining projection rows with no sales history = manually added products. A product picked
  // from the catalog keeps its category (so SACCO ones count in units).
  const manualRefs = [...projByRef.keys()];
  const manualCategoria = new Map<string, string | null>(
    manualRefs.length === 0
      ? []
      : (
          await query<{ producto_ref: string; categoria_n2: string | null }>(
            `SELECT producto_ref, MAX(NULLIF(categoria_n2, '')) AS categoria_n2 FROM sales
             WHERE producto_ref IN (${placeholders(manualRefs.length)}) GROUP BY producto_ref`,
            manualRefs
          )
        ).map((r) => [r.producto_ref, r.categoria_n2])
  );
  for (const proj of projByRef.values()) {
    const storedProyeccion = proj.proyeccion != null ? Number(proj.proyeccion) : null;
    const clientSum = clientQtyByRef.get(proj.producto_ref);
    if (clientSum !== undefined && clientSum !== storedProyeccion) {
      corrections.push({ producto_ref: proj.producto_ref, producto_nombre: proj.producto_nombre, proyeccion: clientSum });
    }
    rows.push({
      producto_ref: proj.producto_ref,
      producto_nombre: proj.producto_nombre,
      categoria_n2: manualCategoria.get(proj.producto_ref) ?? null,
      cantidad_total: 0,
      promedio_mensual: 0,
      promedio_usd: 0,
      proyeccion: clientSum !== undefined ? clientSum : storedProyeccion,
      ingreso_proyectado: revenueByRef.get(proj.producto_ref) ?? 0,
      observaciones: proj.observaciones,
      is_manual: true,
    });
  }

  rows.sort((a, b) => b.promedio_mensual - a.promedio_mensual);

  if (periodStatus(projectionPeriod) === "open" && corrections.length > 0) {
    await persistProjectionCorrections(projectionPeriod, vendedor, corrections);
  }

  // A product with no proyección yet defaults (for display) to its own 3-month average — the
  // same rule client rows use. Persist that default now so it's already there when nobody has
  // touched anything: dashboard totals, exports and coverage all read from `projections`.
  if (periodStatus(projectionPeriod) === "open") {
    const toDefault = rows.filter((r) => r.proyeccion === null && r.promedio_mensual > 0);
    if (toDefault.length > 0) {
      await materializeDefaultProjections(projectionPeriod, vendedor, toDefault);
      for (const r of toDefault) r.proyeccion = Math.round(r.promedio_mensual);
    }
  }

  return rows;
}

/** Overwrites `projections.proyeccion` for rows whose stored value disagrees with the fresh
 * client-level sum — unlike materializeDefaultProjections, this updates existing rows. */
async function persistProjectionCorrections(
  period: string,
  vendedor: string,
  rows: { producto_ref: string; producto_nombre: string; proyeccion: number }[]
): Promise<void> {
  const params: unknown[] = [period, vendedor];
  const tuples: string[] = [];
  for (const r of rows) {
    const base = params.length;
    tuples.push(`($1,$2,$${base + 1},$${base + 2},$${base + 3},FALSE,now())`);
    params.push(r.producto_ref, r.producto_nombre, r.proyeccion);
  }
  await query(
    `INSERT INTO projections (period, vendedor, producto_ref, producto_nombre, proyeccion, is_manual, updated_at)
     VALUES ${tuples.join(",")}
     ON CONFLICT (period, vendedor, producto_ref) DO UPDATE SET
       proyeccion = excluded.proyeccion,
       updated_at = now()`,
    params
  );
}

async function materializeDefaultProjections(
  period: string,
  vendedor: string,
  rows: { producto_ref: string; producto_nombre: string; promedio_mensual: number }[]
): Promise<void> {
  const params: unknown[] = [period, vendedor];
  const tuples: string[] = [];
  for (const r of rows) {
    const base = params.length;
    tuples.push(`($1,$2,$${base + 1},$${base + 2},$${base + 3},FALSE,now())`);
    params.push(r.producto_ref, r.producto_nombre, Math.round(r.promedio_mensual));
  }
  await query(
    `INSERT INTO projections (period, vendedor, producto_ref, producto_nombre, proyeccion, is_manual, updated_at)
     VALUES ${tuples.join(",")}
     ON CONFLICT (period, vendedor, producto_ref) DO NOTHING`,
    params
  );
}

/**
 * For a "Venta Spot" account with no sales history of its own: the entire product catalog,
 * so they can add a proyección for whatever comes up, rather than only the (empty) list of
 * things they've personally sold.
 */
export async function getFullCatalogProductTable(vendedor: string, projectionPeriod: string): Promise<ProductRow[]> {
  const catalogRows = await query<{ producto_ref: string; producto_nombre: string; categoria_n2: string | null }>(
    `SELECT producto_ref, MAX(producto_nombre) as producto_nombre, MAX(NULLIF(categoria_n2, '')) as categoria_n2
     FROM sales GROUP BY producto_ref`
  );

  const projRows = await query<{
    producto_ref: string;
    producto_nombre: string;
    proyeccion: number | null;
    observaciones: string | null;
  }>(`SELECT producto_ref, producto_nombre, proyeccion, observaciones FROM projections WHERE vendedor = $1 AND period = $2`, [
    vendedor,
    projectionPeriod,
  ]);
  const projByRef = new Map(projRows.map((p) => [p.producto_ref, p]));
  const revenueByRef = await revenueByProduct(projectionPeriod, vendedor);
  const clientQtyByRef = await clientQtySumByProduct(projectionPeriod, vendedor);
  const corrections: { producto_ref: string; producto_nombre: string; proyeccion: number }[] = [];

  const rows: ProductRow[] = catalogRows.map((c) => {
    const proj = projByRef.get(c.producto_ref);
    const storedProyeccion = proj?.proyeccion != null ? Number(proj.proyeccion) : null;
    const clientSum = clientQtyByRef.get(c.producto_ref);
    if (clientSum !== undefined && clientSum !== storedProyeccion) {
      corrections.push({ producto_ref: c.producto_ref, producto_nombre: c.producto_nombre, proyeccion: clientSum });
    }
    return {
      producto_ref: c.producto_ref,
      producto_nombre: c.producto_nombre,
      categoria_n2: c.categoria_n2,
      cantidad_total: 0,
      promedio_mensual: 0,
      promedio_usd: 0,
      proyeccion: clientSum !== undefined ? clientSum : storedProyeccion,
      ingreso_proyectado: revenueByRef.get(c.producto_ref) ?? 0,
      observaciones: proj?.observaciones ?? null,
      is_manual: false,
    };
  });

  if (periodStatus(projectionPeriod) === "open" && corrections.length > 0) {
    await persistProjectionCorrections(projectionPeriod, vendedor, corrections);
  }

  // Prioritize items that already have a proyección set, then fall back to alphabetical.
  rows.sort((a, b) => {
    if ((a.proyeccion !== null) !== (b.proyeccion !== null)) return a.proyeccion !== null ? -1 : 1;
    return a.producto_nombre.localeCompare(b.producto_nombre, "es");
  });
  return rows;
}

export type ProductVendorRow = {
  vendedor: string;
  region: Region;
  promedio_mensual: number;
  proyeccion: number | null;
};

/** For one product: which vendedores sell it, their 3-month avg qty, and this month's proyección. */
export async function getProductVendorBreakdown(
  producto_ref: string,
  period: string,
  region?: Region
): Promise<ProductVendorRow[]> {
  const closed = closedMonthsForPeriod(period);
  const denom = Math.max(await uploadedPeriodsCount(closed), 1);

  const where: string[] = [`producto_ref = $1`, `period IN (${placeholders(closed.length, 2)})`];
  const params: unknown[] = [producto_ref, ...closed];
  if (region) {
    where.push(`region = $${params.length + 1}`);
    params.push(region);
  }

  const salesRows = await query<{ vendedor: string; region: Region; total: number }>(
    `SELECT vendedor, MAX(region) as region, SUM(cantidad) as total
     FROM sales WHERE ${where.join(" AND ")}
     GROUP BY vendedor
     ORDER BY total DESC`,
    params
  );

  const projRows = await query<{ vendedor: string; proyeccion: number | null }>(
    `SELECT vendedor, proyeccion FROM projections WHERE producto_ref = $1 AND period = $2`,
    [producto_ref, period]
  );
  const projByVendedor = new Map(projRows.map((p) => [p.vendedor, p.proyeccion]));

  return salesRows.map((r) => ({
    vendedor: r.vendedor,
    region: r.region,
    promedio_mensual: Number(r.total) / denom,
    proyeccion:
      projByVendedor.get(r.vendedor) != null ? Number(projByVendedor.get(r.vendedor)) : null,
  }));
}

export type DashboardFilters = { region?: Region; vendedor?: string; q?: string; categoriaN2?: string };

export type Kpis = {
  promedioTotal: QtySplit;
  proyeccionTotal: QtySplit;
  ingresoProyectado: number;
  vendedores: number;
  productos: number;
};

type Scope = { where: string[]; params: unknown[] };

/** Filters over `sales`, for the given closed months. */
function salesScope(periods: string[], filters: DashboardFilters): Scope {
  const where: string[] = [`period IN (${placeholders(periods.length, 1)})`];
  const params: unknown[] = [...periods];
  if (filters.region) {
    where.push(`region = $${params.length + 1}`);
    params.push(filters.region);
  }
  if (filters.vendedor) {
    where.push(`vendedor = $${params.length + 1}`);
    params.push(filters.vendedor);
  }
  if (filters.categoriaN2) {
    where.push(`categoria_n2 = $${params.length + 1}`);
    params.push(filters.categoriaN2);
  }
  return { where, params };
}

/** The same filters over `projections` / `client_projections` (keyed by vendedor + producto_ref). */
function projScope(period: string, filters: DashboardFilters): Scope {
  const where: string[] = [`period = $1`];
  const params: unknown[] = [period];
  if (filters.vendedor) {
    where.push(`vendedor = $${params.length + 1}`);
    params.push(filters.vendedor);
  } else if (filters.region) {
    // Restrict to vendedores that belong to the selected region.
    where.push(`vendedor IN (SELECT DISTINCT vendedor FROM sales WHERE region = $${params.length + 1})`);
    params.push(filters.region);
  }
  if (filters.categoriaN2) {
    where.push(
      `producto_ref IN (SELECT DISTINCT producto_ref FROM sales WHERE categoria_n2 = $${params.length + 1})`
    );
    params.push(filters.categoriaN2);
  }
  return { where, params };
}

/** Joins the SACCO (units) product refs onto a projections-style table as `sc.sacco_ref`. */
function saccoJoin(table: string): string {
  return `LEFT JOIN (SELECT DISTINCT producto_ref AS sacco_ref FROM sales WHERE ${saccoCondition()}) sc
          ON sc.sacco_ref = ${table}.producto_ref`;
}

/** kg / und split of a quantity column on a table joined through saccoJoin(). */
function splitSelect(column: string): string {
  return `SUM(CASE WHEN sc.sacco_ref IS NULL THEN ${column} ELSE 0 END) AS kg,
          SUM(CASE WHEN sc.sacco_ref IS NOT NULL THEN ${column} ELSE 0 END) AS und`;
}

const toSplit = (r: { kg: number | null; und: number | null } | undefined, divisor = 1): QtySplit => ({
  kg: Number(r?.kg ?? 0) / divisor,
  und: Number(r?.und ?? 0) / divisor,
});

/** Projected revenue (USD): each client's proyección × precio (rounded to cents). */
async function projectedRevenue(scope: Scope): Promise<number> {
  const row = await queryOne<{ total: number | null }>(
    `SELECT SUM(proyeccion_cantidad * ROUND(precio::numeric, 2)::double precision) AS total
     FROM client_projections
     WHERE ${[...scope.where, `proyeccion_cantidad IS NOT NULL`, `precio IS NOT NULL`].join(" AND ")}`,
    scope.params
  );
  return Number(row?.total ?? 0);
}

async function projectedQty(scope: Scope): Promise<QtySplit> {
  const row = await queryOne<{ kg: number | null; und: number | null }>(
    `SELECT ${splitSelect("projections.proyeccion")}
     FROM projections ${saccoJoin("projections")}
     WHERE ${scope.where.join(" AND ")}`,
    scope.params
  );
  return toSplit(row);
}

export async function getDashboardKpis(period: string, filters: DashboardFilters): Promise<Kpis> {
  const closed = closedMonthsForPeriod(period);
  const denom = Math.max(await uploadedPeriodsCount(closed), 1);
  const sales = salesScope(closed, filters);
  const proj = projScope(period, filters);

  const agg = await queryOne<{
    kg: number | null;
    und: number | null;
    vendedores: number;
    productos: number;
  }>(
    `SELECT SUM(CASE WHEN ${saccoCondition()} THEN 0 ELSE cantidad END) AS kg,
            SUM(CASE WHEN ${saccoCondition()} THEN cantidad ELSE 0 END) AS und,
            COUNT(DISTINCT vendedor) AS vendedores, COUNT(DISTINCT producto_ref) AS productos
     FROM sales WHERE ${sales.where.join(" AND ")}`,
    sales.params
  );

  return {
    promedioTotal: toSplit(agg, denom),
    proyeccionTotal: await projectedQty(proj),
    ingresoProyectado: await projectedRevenue(proj),
    vendedores: Number(agg?.vendedores ?? 0),
    productos: Number(agg?.productos ?? 0),
  };
}

export type PeriodComparison = {
  previousPeriod: string;
  proyectado: QtySplit;
  real: QtySplit;
  proyectadoUsd: number;
  realUsd: number;
  excedido: boolean;
};

/**
 * Compares what was projected for the most recently closed month against its actual sales
 * (once that month's Excel has been imported), in quantity (kg / und) and in dollars — the
 * "did we hit our own projection" check that becomes meaningful right after month-end close.
 */
export async function getPeriodComparison(period: string, filters: DashboardFilters): Promise<PeriodComparison> {
  const closed = closedMonthsForPeriod(period);
  const previousPeriod = closed[closed.length - 1];

  const sales = salesScope([previousPeriod], filters);
  const proj = projScope(previousPeriod, filters);

  const real = await queryOne<{ kg: number | null; und: number | null; usd: number | null }>(
    `SELECT SUM(CASE WHEN ${saccoCondition()} THEN 0 ELSE cantidad END) AS kg,
            SUM(CASE WHEN ${saccoCondition()} THEN cantidad ELSE 0 END) AS und,
            SUM(ingreso_soles) AS usd
     FROM sales WHERE ${sales.where.join(" AND ")}`,
    sales.params
  );
  const proyectado = await projectedQty(proj);
  const realQty = toSplit(real);

  return {
    previousPeriod,
    proyectado,
    real: realQty,
    proyectadoUsd: await projectedRevenue(proj),
    realUsd: Number(real?.usd ?? 0),
    excedido: isExcedido(proyectado, realQty),
  };
}

export type PeriodComparisonRow = {
  vendedor: string;
  producto_ref: string;
  producto_nombre: string;
  unidad: Unit;
  proyectado: number;
  real: number;
  proyectado_usd: number;
  real_usd: number;
};

/** Per vendedor+producto detail behind getPeriodComparison, for the drill-down page. */
export async function getPeriodComparisonBreakdown(
  previousPeriod: string,
  filters: DashboardFilters
): Promise<PeriodComparisonRow[]> {
  const sales = salesScope([previousPeriod], filters);
  const proj = projScope(previousPeriod, filters);

  const salesRows = await query<{
    vendedor: string;
    producto_ref: string;
    producto_nombre: string;
    total: number;
    usd: number;
  }>(
    `SELECT vendedor, producto_ref, MAX(producto_nombre) as producto_nombre,
            SUM(cantidad) as total, SUM(ingreso_soles) as usd
     FROM sales WHERE ${sales.where.join(" AND ")}
     GROUP BY vendedor, producto_ref`,
    sales.params
  );
  const projRows = await query<{
    vendedor: string;
    producto_ref: string;
    producto_nombre: string;
    proyeccion: number | null;
  }>(
    `SELECT vendedor, producto_ref, producto_nombre, proyeccion FROM projections WHERE ${proj.where.join(" AND ")}`,
    proj.params
  );
  const usdRows = await query<{ vendedor: string; producto_ref: string; usd: number }>(
    `SELECT vendedor, producto_ref,
            SUM(proyeccion_cantidad * ROUND(precio::numeric, 2)::double precision) AS usd
     FROM client_projections
     WHERE ${[...proj.where, `proyeccion_cantidad IS NOT NULL`, `precio IS NOT NULL`].join(" AND ")}
     GROUP BY vendedor, producto_ref`,
    proj.params
  );
  const saccoRefs = new Set(
    (
      await query<{ producto_ref: string }>(
        `SELECT DISTINCT producto_ref FROM sales WHERE ${saccoCondition()}`
      )
    ).map((r) => r.producto_ref)
  );

  const map = new Map<string, PeriodComparisonRow>();
  const rowFor = (vendedor: string, producto_ref: string, producto_nombre: string): PeriodComparisonRow => {
    const key = `${vendedor}::${producto_ref}`;
    let row = map.get(key);
    if (!row) {
      row = {
        vendedor,
        producto_ref,
        producto_nombre,
        unidad: saccoRefs.has(producto_ref) ? "und" : "kg",
        proyectado: 0,
        real: 0,
        proyectado_usd: 0,
        real_usd: 0,
      };
      map.set(key, row);
    }
    return row;
  };

  for (const r of salesRows) {
    const row = rowFor(r.vendedor, r.producto_ref, r.producto_nombre);
    row.real = Number(r.total);
    row.real_usd = Number(r.usd ?? 0);
  }
  for (const p of projRows) {
    rowFor(p.vendedor, p.producto_ref, p.producto_nombre).proyectado = p.proyeccion != null ? Number(p.proyeccion) : 0;
  }
  for (const u of usdRows) {
    const row = map.get(`${u.vendedor}::${u.producto_ref}`);
    if (row) row.proyectado_usd = Number(u.usd ?? 0);
  }

  return [...map.values()].sort((a, b) => b.real_usd - b.proyectado_usd - (a.real_usd - a.proyectado_usd));
}

export type RegionSummaryRow = Kpis & { region: Region };

export async function getRegionBreakdown(period: string): Promise<RegionSummaryRow[]> {
  const regions: Region[] = ["LIMA", "AREQUIPA", "TRUJILLO"];
  const results: RegionSummaryRow[] = [];
  for (const region of regions) {
    const kpis = await getDashboardKpis(period, { region });
    results.push({ region, ...kpis });
  }
  return results;
}

export type VendorSummaryRow = {
  vendedor: string;
  productos: number;
  promedio_mensual: QtySplit;
  proyeccion: QtySplit;
  pendientes: number;
};

export async function getVendorSummaryForRegion(
  region: Region,
  period: string
): Promise<VendorSummaryRow[]> {
  const closed = closedMonthsForPeriod(period);
  const denom = Math.max(await uploadedPeriodsCount(closed), 1);

  const salesRows = await query<{
    vendedor: string;
    producto_ref: string;
    total: number;
    categoria_n2: string | null;
  }>(
    `SELECT vendedor, producto_ref, SUM(cantidad) as total, MAX(NULLIF(categoria_n2, '')) as categoria_n2
     FROM sales
     WHERE region = $1 AND period IN (${placeholders(closed.length, 2)})
     GROUP BY vendedor, producto_ref`,
    [region, ...closed]
  );

  const projRows = await query<{ vendedor: string; producto_ref: string; proyeccion: number | null }>(
    `SELECT vendedor, producto_ref, proyeccion
     FROM projections
     WHERE period = $1 AND vendedor IN (SELECT DISTINCT vendedor FROM sales WHERE region = $2)`,
    [period, region]
  );
  const projByKey = new Map(projRows.map((p) => [`${p.vendedor}::${p.producto_ref}`, p.proyeccion]));

  const byVendor = new Map<string, VendorSummaryRow>();
  for (const row of salesRows) {
    const entry = byVendor.get(row.vendedor) ?? {
      vendedor: row.vendedor,
      productos: 0,
      promedio_mensual: emptyQty(),
      proyeccion: emptyQty(),
      pendientes: 0,
    };
    const unit = unitForCategoria(row.categoria_n2);
    entry.productos += 1;
    addQty(entry.promedio_mensual, unit, Number(row.total) / denom);
    const proyeccion = projByKey.get(`${row.vendedor}::${row.producto_ref}`);
    if (proyeccion != null) addQty(entry.proyeccion, unit, Number(proyeccion));
    else entry.pendientes += 1;
    byVendor.set(row.vendedor, entry);
  }

  return [...byVendor.values()].sort(
    (a, b) => b.promedio_mensual.kg + b.promedio_mensual.und - (a.promedio_mensual.kg + a.promedio_mensual.und)
  );
}

export type ProductBreakdownRow = {
  /** Representative ref (largest package in the family) — use `producto_refs` for querying. */
  producto_ref: string;
  producto_refs: string[];
  producto_nombre: string;
  categoria: string | null;
  categoria_n2: string | null;
  marca: string | null;
  cantidad_total: number;
  promedio_mensual: number;
  vendedores: number;
  /** Names of the vendedores selling it, alphabetically. */
  vendedor_nombres: string[];
};

/**
 * Ranked product table (desc by 3-month avg qty), optionally scoped by region/vendedor/search
 * text/categoria_n2. Package-size variants of the same item (e.g. ACEK1-061-001/005/025) are
 * summed into one row here — dashboard-only, /ventas keeps them separate.
 */
export async function getProductBreakdown(
  period: string,
  filters: DashboardFilters,
  limit = 12
): Promise<ProductBreakdownRow[]> {
  const closed = closedMonthsForPeriod(period);
  const denom = Math.max(await uploadedPeriodsCount(closed), 1);

  const where: string[] = [`period IN (${placeholders(closed.length, 1)})`];
  const params: unknown[] = [...closed];
  if (filters.region) {
    where.push(`region = $${params.length + 1}`);
    params.push(filters.region);
  }
  if (filters.vendedor) {
    where.push(`vendedor = $${params.length + 1}`);
    params.push(filters.vendedor);
  }
  if (filters.categoriaN2) {
    where.push(`categoria_n2 = $${params.length + 1}`);
    params.push(filters.categoriaN2);
  }
  if (filters.q) {
    where.push(`(producto_nombre ILIKE $${params.length + 1} OR producto_ref ILIKE $${params.length + 1})`);
    params.push(`%${filters.q}%`);
  }

  const rows = await query<{
    producto_ref: string;
    vendedor: string;
    producto_nombre: string;
    categoria: string | null;
    categoria_n2: string | null;
    marca: string | null;
    total: number;
  }>(
    `SELECT producto_ref, vendedor,
            MAX(producto_nombre) as producto_nombre,
            MAX(NULLIF(categoria, '')) as categoria,
            MAX(NULLIF(categoria_n2, '')) as categoria_n2,
            MAX(NULLIF(marca, '')) as marca,
            SUM(cantidad) as total
     FROM sales WHERE ${where.join(" AND ")}
     GROUP BY producto_ref, vendedor`,
    params
  );

  type Family = {
    key: string;
    variants: Map<string, { producto_nombre: string; categoria: string | null; categoria_n2: string | null; marca: string | null; total: number }>;
    vendedores: Set<string>;
    total: number;
  };
  const families = new Map<string, Family>();

  for (const r of rows) {
    const key = productFamilyKey(r.producto_ref);
    const fam = families.get(key) ?? { key, variants: new Map(), vendedores: new Set(), total: 0 };
    fam.vendedores.add(r.vendedor);
    fam.total += Number(r.total);
    const variant = fam.variants.get(r.producto_ref);
    if (variant) variant.total += Number(r.total);
    else
      fam.variants.set(r.producto_ref, {
        producto_nombre: r.producto_nombre,
        categoria: r.categoria,
        categoria_n2: r.categoria_n2,
        marca: r.marca,
        total: Number(r.total),
      });
    families.set(key, fam);
  }

  const result: ProductBreakdownRow[] = [];
  for (const fam of families.values()) {
    let bestRef = "";
    let bestVariant = { producto_nombre: "", categoria: null as string | null, categoria_n2: null as string | null, marca: null as string | null, total: 0 };
    let bestSize = -1;
    for (const [ref, variant] of fam.variants) {
      const size = parseSizeGrams(variant.producto_nombre);
      if (size > bestSize) {
        bestSize = size;
        bestRef = ref;
        bestVariant = variant;
      }
    }
    result.push({
      producto_ref: bestRef,
      producto_refs: [...fam.variants.keys()],
      producto_nombre: bestVariant.producto_nombre,
      categoria: bestVariant.categoria,
      categoria_n2: bestVariant.categoria_n2,
      marca: bestVariant.marca,
      cantidad_total: fam.total,
      vendedores: fam.vendedores.size,
      vendedor_nombres: [...fam.vendedores].sort((a, b) => a.localeCompare(b, "es")),
      promedio_mensual: fam.total / denom,
    });
  }

  result.sort((a, b) => b.cantidad_total - a.cantidad_total);
  return result.slice(0, limit);
}

export type DirectoryUser = { vendedor: string; region: Region | null; name: string };

export async function listVendedores(): Promise<DirectoryUser[]> {
  const rows = await query<DirectoryUser>(
    `SELECT vendedor, region, name FROM users ORDER BY name`
  );
  return rows;
}

/** All categories, or only the ones a given vendedor actually has movement in. */
export async function listCategoriaN2(vendedor?: string): Promise<string[]> {
  const where = [`categoria_n2 IS NOT NULL`, `categoria_n2 != ''`];
  const params: unknown[] = [];
  if (vendedor) {
    params.push(vendedor);
    where.push(`vendedor = $${params.length}`);
  }
  const rows = await query<{ categoria_n2: string }>(
    `SELECT DISTINCT categoria_n2 FROM sales WHERE ${where.join(" AND ")} ORDER BY categoria_n2`,
    params
  );
  return rows.map((r) => r.categoria_n2);
}

export async function listImports() {
  const rows = await query<{
    id: number;
    filename: string;
    periods_json: string;
    row_count: number;
    uploaded_at: string;
    uploaded_by_name: string | null;
  }>(
    `SELECT imports.id, filename, periods_json, row_count, uploaded_at, users.name as uploaded_by_name
     FROM imports LEFT JOIN users ON users.id = imports.uploaded_by
     ORDER BY uploaded_at DESC LIMIT 20`
  );
  return rows;
}
