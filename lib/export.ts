import * as XLSX from "xlsx";
import { query } from "./db";
import { listUsers } from "./users";
import { getVendorProductTable, getFullCatalogProductTable } from "./sales";
import { unitForCategoria, type Unit } from "./units";

export const SIN_PROVEEDOR = "Sin proveedor";

export type ProjectionExportRow = {
  vendedor: string;
  sede: string;
  producto: string;
  /** Brand of the product as it comes in the sales report — the supplier ("proveedor"). */
  proveedor: string;
  cantidad: number;
  unidad: Unit;
  /** Projected revenue (USD) for this vendedor+producto: sum of each client's proyección × precio. */
  ingreso: number;
  fijado: string;
};

/**
 * One row per (vendedor, producto) with a proyección for the period — every product a vendedor
 * has, whether or not they've explicitly touched it (untouched ones default to their historical
 * average, same as what they'd see on their own page) — plus whether any client under that
 * product is "fijado" (pinned) and until when.
 */
export async function getProjectionExportRows(period: string): Promise<ProjectionExportRow[]> {
  const users = await listUsers();
  const vendedores = users.filter((u): u is typeof u & { vendedor: string } => !!u.vendedor);

  const fijadoRows = await query<{ vendedor: string; producto_ref: string; fijado_hasta: string }>(
    `SELECT vendedor, producto_ref, MAX(fijado_hasta)::text as fijado_hasta
     FROM client_projections
     WHERE period = $1 AND fijado_hasta IS NOT NULL
     GROUP BY vendedor, producto_ref`,
    [period]
  );
  const fijadoByKey = new Map(fijadoRows.map((r) => [`${r.vendedor}::${r.producto_ref}`, r.fijado_hasta]));

  const marcaRows = await query<{ producto_ref: string; marca: string | null }>(
    `SELECT producto_ref, MAX(NULLIF(TRIM(marca), '')) AS marca FROM sales GROUP BY producto_ref`
  );
  const marcaByRef = new Map(marcaRows.map((r) => [r.producto_ref, r.marca]));

  // The category belongs to the product: take it from any of its sales rows, not from the single
  // vendedor's rows, which can be blank for months imported before that column was read.
  const categoriaRows = await query<{ producto_ref: string; categoria_n2: string | null }>(
    `SELECT producto_ref, MAX(NULLIF(TRIM(categoria_n2), '')) AS categoria_n2 FROM sales GROUP BY producto_ref`
  );
  const categoriaByRef = new Map(categoriaRows.map((r) => [r.producto_ref, r.categoria_n2]));

  const perVendedor = await Promise.all(
    vendedores.map(async (u) => {
      const rows = u.is_spot
        ? await getFullCatalogProductTable(u.vendedor, period)
        : await getVendorProductTable(u.vendedor, period);
      return rows
        .filter((row) => row.proyeccion !== null)
        .map((row): ProjectionExportRow => {
          const fijado = fijadoByKey.get(`${u.vendedor}::${row.producto_ref}`);
          return {
            vendedor: u.vendedor,
            sede: u.region ?? "",
            producto: row.producto_nombre,
            proveedor: marcaByRef.get(row.producto_ref) ?? SIN_PROVEEDOR,
            cantidad: row.proyeccion as number,
            unidad: unitForCategoria(categoriaByRef.get(row.producto_ref) ?? row.categoria_n2),
            ingreso: row.ingreso_proyectado,
            fijado: fijado ? `Fijado hasta ${fijado}` : "No fijado",
          };
        });
    })
  );

  return perVendedor
    .flat()
    .sort((a, b) => a.vendedor.localeCompare(b.vendedor, "es") || a.producto.localeCompare(b.producto, "es"));
}

export type ProjectionExportProductSummaryRow = {
  producto: string;
  unidad: Unit;
  cantidad_total: number;
  vendedores: string;
};

/** Groups export rows by producto — total proyectado and which vendedores contribute to it. */
export function summarizeExportByProduct(rows: ProjectionExportRow[]): ProjectionExportProductSummaryRow[] {
  // Keyed by name and unit: kilograms and units are never added into the same total.
  const byProduct = new Map<
    string,
    { producto: string; unidad: Unit; cantidad_total: number; vendedores: Set<string> }
  >();
  for (const r of rows) {
    const key = `${r.producto}::${r.unidad}`;
    const entry =
      byProduct.get(key) ?? { producto: r.producto, unidad: r.unidad, cantidad_total: 0, vendedores: new Set<string>() };
    entry.cantidad_total += r.cantidad;
    entry.vendedores.add(r.vendedor);
    byProduct.set(key, entry);
  }
  return [...byProduct.values()]
    .map((v) => ({
      producto: v.producto,
      unidad: v.unidad,
      cantidad_total: v.cantidad_total,
      vendedores: [...v.vendedores].sort((a, b) => a.localeCompare(b, "es")).join(", "),
    }))
    .sort((a, b) => b.cantidad_total - a.cantidad_total);
}

export type ProjectionExportProveedorRow = {
  proveedor: string;
  productos: number;
  kg: number;
  und: number;
  ingreso: number;
  vendedores: string;
};

/**
 * Groups export rows by proveedor (brand): how much is projected from each, in kilograms and in
 * units (never added together) and in dollars, how many distinct products that is, and which
 * vendedores contribute. Biggest dollar amount first.
 */
export function summarizeExportByProveedor(rows: ProjectionExportRow[]): ProjectionExportProveedorRow[] {
  const byProveedor = new Map<
    string,
    { productos: Set<string>; kg: number; und: number; ingreso: number; vendedores: Set<string> }
  >();
  for (const r of rows) {
    const entry = byProveedor.get(r.proveedor) ?? {
      productos: new Set<string>(),
      kg: 0,
      und: 0,
      ingreso: 0,
      vendedores: new Set<string>(),
    };
    entry.productos.add(r.producto);
    entry[r.unidad] += r.cantidad;
    entry.ingreso += r.ingreso;
    entry.vendedores.add(r.vendedor);
    byProveedor.set(r.proveedor, entry);
  }
  return [...byProveedor.entries()]
    .map(([proveedor, v]) => ({
      proveedor,
      productos: v.productos.size,
      kg: v.kg,
      und: v.und,
      ingreso: v.ingreso,
      vendedores: [...v.vendedores].sort((a, b) => a.localeCompare(b, "es")).join(", "),
    }))
    .sort((a, b) => b.ingreso - a.ingreso || a.proveedor.localeCompare(b.proveedor, "es"));
}

export type ProjectionExportProveedorProductoRow = {
  proveedor: string;
  producto: string;
  unidad: Unit;
  cantidad: number;
  ingreso: number;
  vendedores: string;
};

/**
 * One row per (proveedor, producto): what's projected of that product across all vendedores, in
 * its own unit and in dollars, and who projects it. Proveedores come in the same order as
 * summarizeExportByProveedor (biggest dollar amount first); inside each, products by dollars and
 * then by quantity.
 */
export function summarizeExportByProveedorProducto(rows: ProjectionExportRow[]): ProjectionExportProveedorProductoRow[] {
  const byKey = new Map<
    string,
    { proveedor: string; producto: string; unidad: Unit; cantidad: number; ingreso: number; vendedores: Set<string> }
  >();
  for (const r of rows) {
    const key = `${r.proveedor}::${r.producto}::${r.unidad}`;
    const entry =
      byKey.get(key) ??
      { proveedor: r.proveedor, producto: r.producto, unidad: r.unidad, cantidad: 0, ingreso: 0, vendedores: new Set<string>() };
    entry.cantidad += r.cantidad;
    entry.ingreso += r.ingreso;
    entry.vendedores.add(r.vendedor);
    byKey.set(key, entry);
  }
  const proveedorOrder = new Map(summarizeExportByProveedor(rows).map((p, i) => [p.proveedor, i]));
  return [...byKey.values()]
    .map((v) => ({
      proveedor: v.proveedor,
      producto: v.producto,
      unidad: v.unidad,
      cantidad: v.cantidad,
      ingreso: v.ingreso,
      vendedores: [...v.vendedores].sort((a, b) => a.localeCompare(b, "es")).join(", "),
    }))
    .sort(
      (a, b) =>
        (proveedorOrder.get(a.proveedor) ?? 0) - (proveedorOrder.get(b.proveedor) ?? 0) ||
        b.ingreso - a.ingreso ||
        b.cantidad - a.cantidad ||
        a.producto.localeCompare(b.producto, "es")
    );
}

/** The downloadable workbook: full detail, plus per-product and per-proveedor summaries. */
export function buildExportWorkbookBuffer(rows: ProjectionExportRow[]): Buffer {
  const summary = summarizeExportByProduct(rows);
  const porProveedor = summarizeExportByProveedor(rows);
  const porProveedorProducto = summarizeExportByProveedorProducto(rows);

  const detailSheet = XLSX.utils.json_to_sheet(
    rows.map((r) => ({
      Vendedor: r.vendedor,
      Sede: r.sede,
      Producto: r.producto,
      Proveedor: r.proveedor,
      Cantidad: r.cantidad,
      Unidad: r.unidad,
      "Detalle de fijado": r.fijado,
    }))
  );
  detailSheet["!cols"] = [{ wch: 22 }, { wch: 12 }, { wch: 50 }, { wch: 28 }, { wch: 10 }, { wch: 8 }, { wch: 24 }];

  const summarySheet = XLSX.utils.json_to_sheet(
    summary.map((r) => ({
      Producto: r.producto,
      "Total proyectado": r.cantidad_total,
      Unidad: r.unidad,
      Vendedores: r.vendedores,
    }))
  );
  summarySheet["!cols"] = [{ wch: 50 }, { wch: 16 }, { wch: 8 }, { wch: 60 }];

  const proveedorSheet = XLSX.utils.json_to_sheet(
    porProveedor.map((r) => ({
      Proveedor: r.proveedor,
      Productos: r.productos,
      "Total kg": r.kg,
      "Total und": r.und,
      "Proyección US$": Math.round(r.ingreso * 100) / 100,
      Vendedores: r.vendedores,
    }))
  );
  proveedorSheet["!cols"] = [{ wch: 34 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 70 }];

  const proveedorProductoSheet = XLSX.utils.json_to_sheet(
    porProveedorProducto.map((r) => ({
      Proveedor: r.proveedor,
      Producto: r.producto,
      Cantidad: r.cantidad,
      Unidad: r.unidad,
      "Proyección US$": Math.round(r.ingreso * 100) / 100,
      Vendedores: r.vendedores,
    }))
  );
  proveedorProductoSheet["!cols"] = [{ wch: 30 }, { wch: 50 }, { wch: 12 }, { wch: 8 }, { wch: 16 }, { wch: 70 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, detailSheet, "Proyeccion");
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumen por producto");
  XLSX.utils.book_append_sheet(workbook, proveedorSheet, "Resumen por proveedor");
  XLSX.utils.book_append_sheet(workbook, proveedorProductoSheet, "Proveedor y productos");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
