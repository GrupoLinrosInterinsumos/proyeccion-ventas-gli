import { query, queryOne } from "./db";
import { closedMonthsForPeriod, periodStatus } from "./period";
import { productFamilyKey, parseSizeGrams } from "./product-family";
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

export type ProductRow = {
  producto_ref: string;
  producto_nombre: string;
  categoria_n2: string | null;
  cantidad_total: number;
  promedio_mensual: number;
  proyeccion: number | null;
  ingreso_proyectado: number;
  observaciones: string | null;
  is_manual: boolean;
};

/** Per producto_ref: sum of proyección × precio across its clients (USD), for one vendedor+period. */
async function revenueByProduct(period: string, vendedor: string): Promise<Map<string, number>> {
  const rows = await query<{ producto_ref: string; total: number }>(
    `SELECT producto_ref, SUM(proyeccion_cantidad * precio) as total
     FROM client_projections
     WHERE period = $1 AND vendedor = $2 AND proyeccion_cantidad IS NOT NULL AND precio IS NOT NULL
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
  }>(
    `SELECT producto_ref, MAX(producto_nombre) as producto_nombre,
            MAX(NULLIF(categoria_n2, '')) as categoria_n2, SUM(cantidad) as total
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
  const revenueByRef = await revenueByProduct(projectionPeriod, vendedor);

  const projByRef = new Map(projRows.map((p) => [p.producto_ref, p]));
  const rows: ProductRow[] = [];

  for (const row of salesRows) {
    const proj = projByRef.get(row.producto_ref);
    projByRef.delete(row.producto_ref);
    rows.push({
      producto_ref: row.producto_ref,
      producto_nombre: row.producto_nombre,
      categoria_n2: row.categoria_n2,
      cantidad_total: Number(row.total),
      promedio_mensual: Number(row.total) / denom,
      proyeccion: proj?.proyeccion != null ? Number(proj.proyeccion) : null,
      ingreso_proyectado: revenueByRef.get(row.producto_ref) ?? 0,
      observaciones: proj?.observaciones ?? null,
      is_manual: false,
    });
  }

  // Remaining projection rows with no sales history = manually added products.
  for (const proj of projByRef.values()) {
    rows.push({
      producto_ref: proj.producto_ref,
      producto_nombre: proj.producto_nombre,
      categoria_n2: null,
      cantidad_total: 0,
      promedio_mensual: 0,
      proyeccion: proj.proyeccion != null ? Number(proj.proyeccion) : null,
      ingreso_proyectado: revenueByRef.get(proj.producto_ref) ?? 0,
      observaciones: proj.observaciones,
      is_manual: true,
    });
  }

  rows.sort((a, b) => b.promedio_mensual - a.promedio_mensual);

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

  const rows: ProductRow[] = catalogRows.map((c) => {
    const proj = projByRef.get(c.producto_ref);
    return {
      producto_ref: c.producto_ref,
      producto_nombre: c.producto_nombre,
      categoria_n2: c.categoria_n2,
      cantidad_total: 0,
      promedio_mensual: 0,
      proyeccion: proj?.proyeccion != null ? Number(proj.proyeccion) : null,
      ingreso_proyectado: revenueByRef.get(c.producto_ref) ?? 0,
      observaciones: proj?.observaciones ?? null,
      is_manual: false,
    };
  });

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
  promedioTotal: number;
  proyeccionTotal: number;
  ingresoProyectado: number;
  vendedores: number;
  productos: number;
  paresConProyeccion: number;
  paresTotal: number;
};

export async function getDashboardKpis(period: string, filters: DashboardFilters): Promise<Kpis> {
  const closed = closedMonthsForPeriod(period);
  const denom = Math.max(await uploadedPeriodsCount(closed), 1);

  const salesWhere: string[] = [`period IN (${placeholders(closed.length, 1)})`];
  const salesParams: unknown[] = [...closed];
  const projWhere: string[] = [`period = $1`];
  const projParams: unknown[] = [period];

  if (filters.region) {
    salesWhere.push(`region = $${salesParams.length + 1}`);
    salesParams.push(filters.region);
  }
  if (filters.vendedor) {
    salesWhere.push(`vendedor = $${salesParams.length + 1}`);
    salesParams.push(filters.vendedor);
    projWhere.push(`vendedor = $${projParams.length + 1}`);
    projParams.push(filters.vendedor);
  } else if (filters.region) {
    // Restrict projections to vendedores that belong to the selected region.
    projWhere.push(
      `vendedor IN (SELECT DISTINCT vendedor FROM sales WHERE region = $${projParams.length + 1})`
    );
    projParams.push(filters.region);
  }
  if (filters.categoriaN2) {
    salesWhere.push(`categoria_n2 = $${salesParams.length + 1}`);
    salesParams.push(filters.categoriaN2);
    projWhere.push(
      `producto_ref IN (SELECT DISTINCT producto_ref FROM sales WHERE categoria_n2 = $${projParams.length + 1})`
    );
    projParams.push(filters.categoriaN2);
  }

  const agg = await queryOne<{
    total: number | null;
    vendedores: number;
    productos: number;
  }>(
    `SELECT SUM(cantidad) as total,
            COUNT(DISTINCT vendedor) as vendedores, COUNT(DISTINCT producto_ref) as productos
     FROM sales WHERE ${salesWhere.join(" AND ")}`,
    salesParams
  );

  const proj = await queryOne<{ total: number | null }>(
    `SELECT SUM(proyeccion) as total FROM projections WHERE ${projWhere.join(" AND ")}`,
    projParams
  );

  const coverage = await queryOne<{ total: number; filled: number }>(
    `SELECT COUNT(*)::int as total, COUNT(p.proyeccion)::int as filled
     FROM (SELECT DISTINCT vendedor, producto_ref FROM sales WHERE ${salesWhere.join(" AND ")}) s
     LEFT JOIN projections p
       ON p.vendedor = s.vendedor AND p.producto_ref = s.producto_ref
      AND p.period = $${salesParams.length + 1} AND p.proyeccion IS NOT NULL`,
    [...salesParams, period]
  );

  // Projected revenue (USD) — the sum of each client's proyección × precio for the period.
  const ingresoWhere: string[] = [`period = $1`, `proyeccion_cantidad IS NOT NULL`, `precio IS NOT NULL`];
  const ingresoParams: unknown[] = [period];
  if (filters.vendedor) {
    ingresoWhere.push(`vendedor = $${ingresoParams.length + 1}`);
    ingresoParams.push(filters.vendedor);
  } else if (filters.region) {
    ingresoWhere.push(`vendedor IN (SELECT DISTINCT vendedor FROM sales WHERE region = $${ingresoParams.length + 1})`);
    ingresoParams.push(filters.region);
  }
  if (filters.categoriaN2) {
    ingresoWhere.push(`producto_ref IN (SELECT DISTINCT producto_ref FROM sales WHERE categoria_n2 = $${ingresoParams.length + 1})`);
    ingresoParams.push(filters.categoriaN2);
  }
  const ingreso = await queryOne<{ total: number | null }>(
    `SELECT SUM(proyeccion_cantidad * precio) as total FROM client_projections WHERE ${ingresoWhere.join(" AND ")}`,
    ingresoParams
  );

  return {
    promedioTotal: Number(agg?.total ?? 0) / denom,
    proyeccionTotal: Number(proj?.total ?? 0),
    ingresoProyectado: Number(ingreso?.total ?? 0),
    vendedores: Number(agg?.vendedores ?? 0),
    productos: Number(agg?.productos ?? 0),
    paresConProyeccion: Number(coverage?.filled ?? 0),
    paresTotal: Number(coverage?.total ?? 0),
  };
}

export type PeriodComparison = {
  previousPeriod: string;
  proyectado: number;
  real: number;
  excedido: boolean;
};

/**
 * Compares what was projected for the most recently closed month against its actual sales
 * (once that month's Excel has been imported) — the "did we hit our own projection" check
 * that becomes meaningful right after month-end close.
 */
export async function getPeriodComparison(period: string, filters: DashboardFilters): Promise<PeriodComparison> {
  const closed = closedMonthsForPeriod(period);
  const previousPeriod = closed[closed.length - 1];

  const salesWhere: string[] = [`period = $1`];
  const salesParams: unknown[] = [previousPeriod];
  const projWhere: string[] = [`period = $1`];
  const projParams: unknown[] = [previousPeriod];

  if (filters.region) {
    salesWhere.push(`region = $${salesParams.length + 1}`);
    salesParams.push(filters.region);
  }
  if (filters.vendedor) {
    salesWhere.push(`vendedor = $${salesParams.length + 1}`);
    salesParams.push(filters.vendedor);
    projWhere.push(`vendedor = $${projParams.length + 1}`);
    projParams.push(filters.vendedor);
  } else if (filters.region) {
    projWhere.push(`vendedor IN (SELECT DISTINCT vendedor FROM sales WHERE region = $${projParams.length + 1})`);
    projParams.push(filters.region);
  }
  if (filters.categoriaN2) {
    salesWhere.push(`categoria_n2 = $${salesParams.length + 1}`);
    salesParams.push(filters.categoriaN2);
    projWhere.push(`producto_ref IN (SELECT DISTINCT producto_ref FROM sales WHERE categoria_n2 = $${projParams.length + 1})`);
    projParams.push(filters.categoriaN2);
  }

  const real = await queryOne<{ total: number | null }>(
    `SELECT SUM(cantidad) as total FROM sales WHERE ${salesWhere.join(" AND ")}`,
    salesParams
  );
  const proyectado = await queryOne<{ total: number | null }>(
    `SELECT SUM(proyeccion) as total FROM projections WHERE ${projWhere.join(" AND ")}`,
    projParams
  );

  const proyectadoNum = Number(proyectado?.total ?? 0);
  const realNum = Number(real?.total ?? 0);

  return {
    previousPeriod,
    proyectado: proyectadoNum,
    real: realNum,
    excedido: proyectadoNum > 0 && realNum > proyectadoNum * 2,
  };
}

export type PeriodComparisonRow = {
  vendedor: string;
  producto_ref: string;
  producto_nombre: string;
  proyectado: number;
  real: number;
};

/** Per vendedor+producto detail behind getPeriodComparison, for the drill-down page. */
export async function getPeriodComparisonBreakdown(
  previousPeriod: string,
  filters: DashboardFilters
): Promise<PeriodComparisonRow[]> {
  const salesWhere: string[] = [`period = $1`];
  const salesParams: unknown[] = [previousPeriod];
  const projWhere: string[] = [`period = $1`];
  const projParams: unknown[] = [previousPeriod];

  if (filters.region) {
    salesWhere.push(`region = $${salesParams.length + 1}`);
    salesParams.push(filters.region);
  }
  if (filters.vendedor) {
    salesWhere.push(`vendedor = $${salesParams.length + 1}`);
    salesParams.push(filters.vendedor);
    projWhere.push(`vendedor = $${projParams.length + 1}`);
    projParams.push(filters.vendedor);
  } else if (filters.region) {
    projWhere.push(`vendedor IN (SELECT DISTINCT vendedor FROM sales WHERE region = $${projParams.length + 1})`);
    projParams.push(filters.region);
  }
  if (filters.categoriaN2) {
    salesWhere.push(`categoria_n2 = $${salesParams.length + 1}`);
    salesParams.push(filters.categoriaN2);
    projWhere.push(`producto_ref IN (SELECT DISTINCT producto_ref FROM sales WHERE categoria_n2 = $${projParams.length + 1})`);
    projParams.push(filters.categoriaN2);
  }

  const salesRows = await query<{ vendedor: string; producto_ref: string; producto_nombre: string; total: number }>(
    `SELECT vendedor, producto_ref, MAX(producto_nombre) as producto_nombre, SUM(cantidad) as total
     FROM sales WHERE ${salesWhere.join(" AND ")}
     GROUP BY vendedor, producto_ref`,
    salesParams
  );
  const projRows = await query<{
    vendedor: string;
    producto_ref: string;
    producto_nombre: string;
    proyeccion: number | null;
  }>(`SELECT vendedor, producto_ref, producto_nombre, proyeccion FROM projections WHERE ${projWhere.join(" AND ")}`, projParams);

  const map = new Map<string, PeriodComparisonRow>();
  for (const r of salesRows) {
    map.set(`${r.vendedor}::${r.producto_ref}`, {
      vendedor: r.vendedor,
      producto_ref: r.producto_ref,
      producto_nombre: r.producto_nombre,
      proyectado: 0,
      real: Number(r.total),
    });
  }
  for (const p of projRows) {
    const key = `${p.vendedor}::${p.producto_ref}`;
    const existing = map.get(key);
    const proyeccion = p.proyeccion != null ? Number(p.proyeccion) : 0;
    if (existing) existing.proyectado = proyeccion;
    else
      map.set(key, {
        vendedor: p.vendedor,
        producto_ref: p.producto_ref,
        producto_nombre: p.producto_nombre,
        proyectado: proyeccion,
        real: 0,
      });
  }

  return [...map.values()].sort((a, b) => (b.real - b.proyectado) - (a.real - a.proyectado));
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
  promedio_mensual: number;
  proyeccion: number;
  pendientes: number;
};

export async function getVendorSummaryForRegion(
  region: Region,
  period: string
): Promise<VendorSummaryRow[]> {
  const closed = closedMonthsForPeriod(period);
  const denom = Math.max(await uploadedPeriodsCount(closed), 1);

  const salesRows = await query<{ vendedor: string; producto_ref: string; total: number }>(
    `SELECT vendedor, producto_ref, SUM(cantidad) as total
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
      promedio_mensual: 0,
      proyeccion: 0,
      pendientes: 0,
    };
    entry.productos += 1;
    entry.promedio_mensual += Number(row.total) / denom;
    const proyeccion = projByKey.get(`${row.vendedor}::${row.producto_ref}`);
    if (proyeccion != null) entry.proyeccion += Number(proyeccion);
    else entry.pendientes += 1;
    byVendor.set(row.vendedor, entry);
  }

  return [...byVendor.values()].sort((a, b) => b.promedio_mensual - a.promedio_mensual);
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

export async function listCategoriaN2(): Promise<string[]> {
  const rows = await query<{ categoria_n2: string }>(
    `SELECT DISTINCT categoria_n2 FROM sales WHERE categoria_n2 IS NOT NULL AND categoria_n2 != '' ORDER BY categoria_n2`
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
