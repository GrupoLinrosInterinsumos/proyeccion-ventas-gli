import { query, queryOne } from "./db";
import { lastClosedMonths } from "./period";
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
  cantidad_total: number;
  promedio_mensual: number;
  proyeccion: number | null;
  observaciones: string | null;
  is_manual: boolean;
};

/** Flat, ordered (desc by 3-month avg) product table for a single vendedor. */
export async function getVendorProductTable(
  vendedor: string,
  projectionPeriod: string
): Promise<ProductRow[]> {
  const closed = lastClosedMonths(3);
  const denom = Math.max(await uploadedPeriodsCount(closed), 1);

  const salesRows = await query<{
    producto_ref: string;
    producto_nombre: string;
    total: number;
  }>(
    `SELECT producto_ref, producto_nombre, SUM(cantidad) as total
     FROM sales
     WHERE vendedor = $1 AND period IN (${placeholders(closed.length, 2)})
     GROUP BY producto_ref, producto_nombre`,
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

  const projByRef = new Map(projRows.map((p) => [p.producto_ref, p]));
  const rows: ProductRow[] = [];

  for (const row of salesRows) {
    const proj = projByRef.get(row.producto_ref);
    projByRef.delete(row.producto_ref);
    rows.push({
      producto_ref: row.producto_ref,
      producto_nombre: row.producto_nombre,
      cantidad_total: Number(row.total),
      promedio_mensual: Number(row.total) / denom,
      proyeccion: proj?.proyeccion != null ? Number(proj.proyeccion) : null,
      observaciones: proj?.observaciones ?? null,
      is_manual: false,
    });
  }

  // Remaining projection rows with no sales history = manually added products.
  for (const proj of projByRef.values()) {
    rows.push({
      producto_ref: proj.producto_ref,
      producto_nombre: proj.producto_nombre,
      cantidad_total: 0,
      promedio_mensual: 0,
      proyeccion: proj.proyeccion != null ? Number(proj.proyeccion) : null,
      observaciones: proj.observaciones,
      is_manual: true,
    });
  }

  rows.sort((a, b) => b.promedio_mensual - a.promedio_mensual);
  return rows;
}

export type ClientBreakdownRow = { partner: string; cantidad: number };

export async function getClientBreakdown(
  vendedor: string,
  producto_ref: string
): Promise<ClientBreakdownRow[]> {
  const closed = lastClosedMonths(3);
  const rows = await query<{ partner: string; cantidad: number }>(
    `SELECT COALESCE(NULLIF(TRIM(partner), ''), 'Sin cliente registrado') as partner, SUM(cantidad) as cantidad
     FROM sales
     WHERE vendedor = $1 AND producto_ref = $2 AND period IN (${placeholders(closed.length, 3)})
     GROUP BY partner
     ORDER BY SUM(cantidad) DESC`,
    [vendedor, producto_ref, ...closed]
  );
  return rows.map((r) => ({ partner: r.partner, cantidad: Number(r.cantidad) }));
}

export type DashboardFilters = { region?: Region; vendedor?: string };

export type Kpis = {
  promedioTotal: number;
  proyeccionTotal: number;
  vendedores: number;
  productos: number;
  paresConProyeccion: number;
  paresTotal: number;
};

export async function getDashboardKpis(period: string, filters: DashboardFilters): Promise<Kpis> {
  const closed = lastClosedMonths(3);
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

  return {
    promedioTotal: Number(agg?.total ?? 0) / denom,
    proyeccionTotal: Number(proj?.total ?? 0),
    vendedores: Number(agg?.vendedores ?? 0),
    productos: Number(agg?.productos ?? 0),
    paresConProyeccion: Number(coverage?.filled ?? 0),
    paresTotal: Number(coverage?.total ?? 0),
  };
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
  const closed = lastClosedMonths(3);
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
  producto_ref: string;
  producto_nombre: string;
  categoria: string | null;
  marca: string | null;
  cantidad_total: number;
  promedio_mensual: number;
  vendedores: number;
};

/** Ranked product table (desc by 3-month avg qty), optionally scoped by region/vendedor. */
export async function getProductBreakdown(
  period: string,
  filters: DashboardFilters,
  limit = 12
): Promise<ProductBreakdownRow[]> {
  const closed = lastClosedMonths(3);
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
  params.push(limit);

  const rows = await query<{
    producto_ref: string;
    producto_nombre: string;
    categoria: string | null;
    marca: string | null;
    total: number;
    vendedores: number;
  }>(
    `SELECT producto_ref,
            MAX(producto_nombre) as producto_nombre,
            MAX(NULLIF(categoria, '')) as categoria,
            MAX(NULLIF(marca, '')) as marca,
            SUM(cantidad) as total,
            COUNT(DISTINCT vendedor) as vendedores
     FROM sales WHERE ${where.join(" AND ")}
     GROUP BY producto_ref
     ORDER BY total DESC
     LIMIT $${params.length}`,
    params
  );

  return rows.map((r) => ({
    producto_ref: r.producto_ref,
    producto_nombre: r.producto_nombre,
    categoria: r.categoria,
    marca: r.marca,
    cantidad_total: Number(r.total),
    promedio_mensual: Number(r.total) / denom,
    vendedores: Number(r.vendedores),
  }));
}

export type DirectoryUser = { vendedor: string; region: Region | null; name: string };

export async function listVendedores(): Promise<DirectoryUser[]> {
  const rows = await query<DirectoryUser>(
    `SELECT vendedor, region, name FROM users ORDER BY name`
  );
  return rows;
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
