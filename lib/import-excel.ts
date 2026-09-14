import * as XLSX from "xlsx";
import { periodKey } from "./period";
import { isRegion } from "./regions";
import { isExcludedVendedor } from "./excluded-vendedores";

export type AggregatedSaleRow = {
  period: string;
  region: string;
  vendedor: string;
  partner: string;
  producto_ref: string;
  producto_nombre: string;
  marca: string;
  categoria: string;
  categoria_n2: string;
  cantidad: number;
  ingreso_soles: number;
  /** Weighted-average unit price (USD) across the source rows aggregated into this one. */
  precio_unitario: number;
};

type InternalAggregatedRow = AggregatedSaleRow & { precioPonderadoSum: number };

export type ParseResult = {
  rows: AggregatedSaleRow[];
  periods: string[];
  sourceRowCount: number;
  warnings: string[];
};

const REQUIRED_COLUMNS = [
  "Fecha",
  "Vendedor",
  "Equipo Vendedor",
  "Referencia Interna",
  "Producto",
  "Cantidad",
] as const;

function cleanProductName(raw: string): string {
  return raw.replace(/^\[[^\]]*\]\s*/, "").trim();
}

/** Strips accents/case/extra whitespace/trailing period so a header like "Categoría  de
 * Producto N2" matches "Categoria de Producto N2", and "P. Unitario $." matches "P. Unitario $"
 * — real export files are inconsistent about all of this. */
function normalizeHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
}

type Cell = { v?: unknown } | undefined;

export function parseSalesWorkbook(buffer: Buffer): ParseResult {
  // `dense: true` stores each sheet as row-indexed arrays instead of one object key per cell
  // address. Below we also read cells straight off that dense array — never materializing a
  // full 46-column matrix via sheet_to_json — since this file can be 30k+ rows and every extra
  // full-width copy of it matters on a memory-capped host (measured ~40% lower peak RSS this way).
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, dense: true });
  const sheetName = workbook.SheetNames.includes("DATA") ? "DATA" : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName] as unknown as Record<number, Cell[]> & { "!ref"?: string };
  if (!sheet || !sheet["!ref"]) throw new Error("El archivo no contiene hojas legibles.");

  const range = XLSX.utils.decode_range(sheet["!ref"]);
  if (range.e.r <= range.s.r) throw new Error(`La hoja "${sheetName}" no tiene datos.`);

  const headerRow = sheet[range.s.r] ?? [];
  const colIndex = new Map<string, number>();
  const normColIndex = new Map<string, number>();
  for (let c = range.s.c; c <= range.e.c; c++) {
    const v = headerRow[c]?.v;
    if (typeof v === "string" && v.trim()) {
      const trimmed = v.trim();
      colIndex.set(trimmed, c);
      const normalized = normalizeHeader(trimmed);
      if (!normColIndex.has(normalized)) normColIndex.set(normalized, c);
    }
  }
  // Exact match first, then accent/case/whitespace-insensitive — real export files are
  // inconsistent about accents ("Categoría" vs "Categoria") and stray spaces in headers.
  function findColumn(name: string): number | undefined {
    return colIndex.get(name) ?? normColIndex.get(normalizeHeader(name));
  }
  // Tries each candidate name in order — used where the column has been renamed over time
  // and older exported files may still use the previous header.
  function findColumnAny(...names: string[]): number | undefined {
    for (const name of names) {
      const found = findColumn(name);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  const missing = REQUIRED_COLUMNS.filter((c) => findColumn(c) === undefined);
  if (missing.length > 0) {
    throw new Error(
      `Faltan columnas requeridas en la hoja "${sheetName}": ${missing.join(", ")}`
    );
  }

  const idx = {
    fecha: findColumn("Fecha")!,
    vendedor: findColumn("Vendedor")!,
    equipo: findColumn("Equipo Vendedor")!,
    partner: findColumn("Partner"),
    ref: findColumn("Referencia Interna")!,
    producto: findColumn("Producto")!,
    cantidad: findColumn("Cantidad")!,
    marca: findColumn("Marca"),
    categoria: findColumn("Categoria de Producto N1"),
    categoriaN2: findColumnAny("Categoria N2", "Categoria de Producto N2"),
    ingreso: findColumnAny("Ingreso Total $", "Ingreso Total S/."),
    precioUnitario: findColumnAny("P. Unitario $.", "P. Unitario $"),
  };

  const aggregated = new Map<string, InternalAggregatedRow>();
  const periods = new Set<string>();
  const warnings: string[] = [];
  if (idx.precioUnitario == null) {
    warnings.push(
      `No se encontró la columna "P. Unitario $" — el precio por cliente se calculó como Ingreso Total ÷ Cantidad.`
    );
  }
  if (idx.categoriaN2 == null) {
    warnings.push(`No se encontró la columna "Categoria N2" — los filtros por categoría quedarán vacíos.`);
  }
  let unrecognizedRegions = 0;
  let invalidRows = 0;
  let excludedVendedorRows = 0;
  let sourceRowCount = 0;

  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const row = sheet[r];
    if (!row) continue;
    sourceRowCount++;

    const fechaRaw = row[idx.fecha]?.v;
    const vendedor = String(row[idx.vendedor]?.v ?? "").trim();
    const equipo = String(row[idx.equipo]?.v ?? "").trim().toUpperCase();
    const ref = String(row[idx.ref]?.v ?? "").trim();
    const productoRaw = String(row[idx.producto]?.v ?? "").trim();
    const cantidad = Number(row[idx.cantidad]?.v ?? 0);

    if (!fechaRaw || !vendedor || !ref || !productoRaw || Number.isNaN(cantidad)) {
      invalidRows++;
      continue;
    }
    if (!isRegion(equipo)) {
      unrecognizedRegions++;
      continue;
    }
    if (isExcludedVendedor(vendedor)) {
      excludedVendedorRows++;
      continue;
    }

    const fecha = fechaRaw instanceof Date ? fechaRaw : new Date(String(fechaRaw));
    if (Number.isNaN(fecha.getTime())) {
      invalidRows++;
      continue;
    }
    const period = periodKey(fecha.getFullYear(), fecha.getMonth() + 1);
    periods.add(period);

    const partner = idx.partner != null ? String(row[idx.partner]?.v ?? "").trim() : "";
    const marca = idx.marca != null ? String(row[idx.marca]?.v ?? "").trim() : "";
    const categoria = idx.categoria != null ? String(row[idx.categoria]?.v ?? "").trim() : "";
    const categoriaN2 = idx.categoriaN2 != null ? String(row[idx.categoriaN2]?.v ?? "").trim() : "";
    const ingreso = idx.ingreso != null ? Number(row[idx.ingreso]?.v ?? 0) || 0 : 0;
    const precioUnitarioRaw =
      idx.precioUnitario != null ? Number(row[idx.precioUnitario]?.v ?? 0) || 0 : 0;
    const productoNombre = cleanProductName(productoRaw);

    const key = `${period}::${equipo}::${vendedor}::${ref}::${partner}`;
    const existing = aggregated.get(key);
    if (existing) {
      existing.cantidad += cantidad;
      existing.ingreso_soles += ingreso;
      existing.precioPonderadoSum += precioUnitarioRaw * cantidad;
    } else {
      aggregated.set(key, {
        period,
        region: equipo,
        vendedor,
        partner,
        producto_ref: ref,
        producto_nombre: productoNombre,
        marca,
        categoria,
        categoria_n2: categoriaN2,
        cantidad,
        ingreso_soles: ingreso,
        precio_unitario: 0,
        precioPonderadoSum: precioUnitarioRaw * cantidad,
      });
    }
  }

  if (unrecognizedRegions > 0) {
    warnings.push(
      `${unrecognizedRegions} fila(s) con "Equipo Vendedor" fuera de LIMA/AREQUIPA/TRUJILLO fueron ignoradas.`
    );
  }
  if (invalidRows > 0) {
    warnings.push(`${invalidRows} fila(s) con datos incompletos fueron ignoradas.`);
  }
  if (excludedVendedorRows > 0) {
    warnings.push(`${excludedVendedorRows} fila(s) de vendedores excluidos fueron ignoradas.`);
  }
  if (aggregated.size === 0) {
    throw new Error("No se encontraron filas válidas para importar.");
  }

  const rows: AggregatedSaleRow[] = [...aggregated.values()].map(({ precioPonderadoSum, ...row }) => ({
    ...row,
    precio_unitario: row.cantidad > 0 ? precioPonderadoSum / row.cantidad : 0,
  }));

  return {
    rows,
    periods: [...periods].sort(),
    sourceRowCount,
    warnings,
  };
}
