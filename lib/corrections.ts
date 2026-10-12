import { query } from "./db";

/**
 * Correcciones de administrador a la proyección de un mes ya cerrado (p. ej. se cayó una venta).
 * No tocan client_projections: se aplican encima en el export para el reporte de cobertura
 * (Agente-correos), que las usa en todos sus reportes de ese mes.
 */

/** Ventas a las empresas del grupo: el reporte de cobertura no las cuenta como demanda. */
export const INTERCOMPANY = /^\s*(LINROS|INTERINSUMOS)\s+S\.?\s*R\.?\s*L\.?\s*$/i;

export type CorrectionTipo = "total" | "ajuste";

export type Correction = {
  id: number;
  period: string;
  producto_ref: string;
  producto_nombre: string;
  tipo: CorrectionTipo;
  cantidad: number;
  motivo: string;
  created_at: string;
  autor: string | null;
  anulada_at: string | null;
  anulada_por: string | null;
};

export type ProjectedByCode = { nombre: string; total: number; grupo: number; vendedores: Set<string> };

/** Proyección del periodo por código, separando lo proyectado a las empresas del grupo. */
export async function projectedByCode(period: string): Promise<Map<string, ProjectedByCode>> {
  const filas = await query<{ producto_ref: string; producto_nombre: string; vendedor: string; partner: string; qty: number | null }>(
    `SELECT producto_ref, MAX(producto_nombre) AS producto_nombre, vendedor, partner,
            SUM(proyeccion_cantidad) AS qty
     FROM client_projections
     WHERE period = $1
     GROUP BY producto_ref, vendedor, partner`,
    [period]
  );
  const porCodigo = new Map<string, ProjectedByCode>();
  for (const f of filas) {
    const qty = Number(f.qty ?? 0);
    const e = porCodigo.get(f.producto_ref) ?? { nombre: f.producto_nombre, total: 0, grupo: 0, vendedores: new Set<string>() };
    e.total += qty;
    if (INTERCOMPANY.test(f.partner)) e.grupo += qty;
    if (qty) e.vendedores.add(f.vendedor);
    porCodigo.set(f.producto_ref, e);
  }
  return porCodigo;
}

export async function listCorrections(period: string, { includeVoided = true } = {}): Promise<Correction[]> {
  return query<Correction>(
    `SELECT c.id, c.period, c.producto_ref, c.producto_nombre, c.tipo, c.cantidad, c.motivo,
            c.created_at, u.name AS autor, c.anulada_at, a.name AS anulada_por
     FROM projection_corrections c
     LEFT JOIN users u ON u.id = c.created_by
     LEFT JOIN users a ON a.id = c.anulada_by
     WHERE c.period = $1 ${includeVoided ? "" : "AND c.anulada_at IS NULL"}
     ORDER BY c.created_at, c.id`,
    [period]
  );
}

const nf = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 });

/**
 * Proyección sin grupo después de las correcciones vigentes, en el orden en que se registraron:
 * "total" reemplaza la cantidad del mes, "ajuste" suma o resta (nunca baja de 0).
 */
export function applyCorrections(base: number, corrections: Correction[]): { valor: number; texto: string } {
  let valor = base;
  const partes: string[] = [];
  for (const c of corrections) {
    const cantidad = Number(c.cantidad);
    valor = c.tipo === "total" ? cantidad : Math.max(0, valor + cantidad);
    const que = c.tipo === "total" ? `total ${nf.format(cantidad)}` : `${cantidad >= 0 ? "+" : "−"}${nf.format(Math.abs(cantidad))}`;
    const fecha = new Date(c.created_at).toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "2-digit" });
    partes.push(`${que}: ${c.motivo}${c.autor ? ` (${c.autor}, ${fecha})` : ""}`);
  }
  return { valor, texto: partes.join("; ") };
}

/** Productos que se pueden corregir: todo el catálogo con ventas, más lo proyectado en el periodo. */
export async function correctableProducts(period: string): Promise<{ ref: string; nombre: string; proyectado: number | null }[]> {
  const [catalogo, proyectado] = await Promise.all([
    query<{ producto_ref: string; producto_nombre: string }>(
      `SELECT producto_ref, MAX(producto_nombre) AS producto_nombre FROM sales GROUP BY producto_ref`
    ),
    projectedByCode(period),
  ]);
  const productos = new Map<string, { ref: string; nombre: string; proyectado: number | null }>();
  for (const p of catalogo) productos.set(p.producto_ref, { ref: p.producto_ref, nombre: p.producto_nombre, proyectado: null });
  for (const [ref, e] of proyectado) {
    productos.set(ref, { ref, nombre: productos.get(ref)?.nombre ?? e.nombre, proyectado: e.total - e.grupo });
  }
  return [...productos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
