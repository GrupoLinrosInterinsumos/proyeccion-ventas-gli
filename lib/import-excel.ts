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
  cantidad: number;
  ingreso_soles: number;
};

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

export function parseSalesWorkbook(buffer: Buffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames.includes("DATA") ? "DATA" : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error("El archivo no contiene hojas legibles.");

  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
  }) as unknown[][];

  if (matrix.length < 2) throw new Error(`La hoja "${sheetName}" no tiene datos.`);

  const header = matrix[0].map((h) => (typeof h === "string" ? h.trim() : h));
  const colIndex = new Map<string, number>();
  header.forEach((h, i) => {
    if (typeof h === "string" && h) colIndex.set(h, i);
  });

  const missing = REQUIRED_COLUMNS.filter((c) => !colIndex.has(c));
  if (missing.length > 0) {
    throw new Error(
      `Faltan columnas requeridas en la hoja "${sheetName}": ${missing.join(", ")}`
    );
  }

  const idx = {
    fecha: colIndex.get("Fecha")!,
    vendedor: colIndex.get("Vendedor")!,
    equipo: colIndex.get("Equipo Vendedor")!,
    partner: colIndex.get("Partner"),
    ref: colIndex.get("Referencia Interna")!,
    producto: colIndex.get("Producto")!,
    cantidad: colIndex.get("Cantidad")!,
    marca: colIndex.get("Marca"),
    categoria: colIndex.get("Categoria de Producto N1"),
    ingreso: colIndex.get("Ingreso Total S/."),
  };

  const aggregated = new Map<string, AggregatedSaleRow>();
  const periods = new Set<string>();
  const warnings: string[] = [];
  let unrecognizedRegions = 0;
  let invalidRows = 0;
  let excludedVendedorRows = 0;

  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row || row.every((c) => c === null || c === "")) continue;

    const fechaRaw = row[idx.fecha];
    const vendedor = String(row[idx.vendedor] ?? "").trim();
    const equipo = String(row[idx.equipo] ?? "").trim().toUpperCase();
    const ref = String(row[idx.ref] ?? "").trim();
    const productoRaw = String(row[idx.producto] ?? "").trim();
    const cantidad = Number(row[idx.cantidad] ?? 0);

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

    const partner = idx.partner != null ? String(row[idx.partner] ?? "").trim() : "";
    const marca = idx.marca != null ? String(row[idx.marca] ?? "").trim() : "";
    const categoria = idx.categoria != null ? String(row[idx.categoria] ?? "").trim() : "";
    const ingreso = idx.ingreso != null ? Number(row[idx.ingreso] ?? 0) || 0 : 0;
    const productoNombre = cleanProductName(productoRaw);

    const key = `${period}::${equipo}::${vendedor}::${ref}::${partner}`;
    const existing = aggregated.get(key);
    if (existing) {
      existing.cantidad += cantidad;
      existing.ingreso_soles += ingreso;
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
        cantidad,
        ingreso_soles: ingreso,
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

  return {
    rows: [...aggregated.values()],
    periods: [...periods].sort(),
    sourceRowCount: matrix.length - 1,
    warnings,
  };
}
