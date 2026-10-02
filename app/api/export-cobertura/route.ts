import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { periodLabel, periodStatus } from "@/lib/period";
import { unitForCategoria } from "@/lib/units";

/**
 * Proyección del periodo por código de producto, para el reporte semanal de cobertura de stock
 * (Agente-correos). Separa lo proyectado a las empresas del grupo (LINROS / INTERINSUMOS), que el
 * reporte no cuenta como demanda.
 *
 * Acceso: sesión de administrador, o `Authorization: Bearer <EXPORT_TOKEN>` para el robot (la
 * sesión vence a los 30 días; el token no). Sin EXPORT_TOKEN configurado solo funciona con sesión.
 */

const INTERCOMPANY = /^\s*(LINROS|INTERINSUMOS)\s+S\.?\s*R\.?\s*L\.?\s*$/i;
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const STATUS_LABEL = { open: "Abierto", closed: "Cerrado", future: "Futuro" } as const;

function tokenValido(req: NextRequest): boolean {
  const esperado = process.env.EXPORT_TOKEN;
  if (!esperado) return false;
  const recibido = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  if (!tokenValido(req)) {
    const session = await getSession();
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
  }

  const period = req.nextUrl.searchParams.get("period") ?? "";
  if (!PERIOD_RE.test(period)) {
    return NextResponse.json({ error: "Periodo inválido (formato AAAA-MM)" }, { status: 400 });
  }

  const filas = await query<{ producto_ref: string; producto_nombre: string; vendedor: string; partner: string; qty: number | null }>(
    `SELECT producto_ref, MAX(producto_nombre) AS producto_nombre, vendedor, partner,
            SUM(proyeccion_cantidad) AS qty
     FROM client_projections
     WHERE period = $1
     GROUP BY producto_ref, vendedor, partner`,
    [period]
  );
  const categorias = await query<{ producto_ref: string; categoria_n2: string | null }>(
    `SELECT producto_ref, MAX(categoria_n2) AS categoria_n2 FROM sales GROUP BY producto_ref`
  );
  const categoriaPorRef = new Map(categorias.map((c) => [c.producto_ref, c.categoria_n2]));

  const porCodigo = new Map<string, { nombre: string; total: number; grupo: number; vendedores: Set<string> }>();
  for (const f of filas) {
    const qty = Number(f.qty ?? 0);
    const e = porCodigo.get(f.producto_ref) ?? { nombre: f.producto_nombre, total: 0, grupo: 0, vendedores: new Set<string>() };
    e.total += qty;
    if (INTERCOMPANY.test(f.partner)) e.grupo += qty;
    if (qty) e.vendedores.add(f.vendedor);
    porCodigo.set(f.producto_ref, e);
  }

  const estado = STATUS_LABEL[periodStatus(period)];
  const hoja = XLSX.utils.json_to_sheet(
    [...porCodigo.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([codigo, e]) => ({
        Periodo: period,
        Estado: estado,
        Codigo: codigo,
        Producto: e.nombre,
        Unidad: unitForCategoria(categoriaPorRef.get(codigo)),
        "Proyeccion total": e.total,
        "Proyeccion empresas del grupo": e.grupo,
        "Proyeccion sin grupo": e.total - e.grupo,
        Vendedores: [...e.vendedores].sort((a, b) => a.localeCompare(b, "es")).join(", "),
      }))
  );
  hoja["!cols"] = [{ wch: 9 }, { wch: 9 }, { wch: 16 }, { wch: 50 }, { wch: 7 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 50 }];

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Por codigo");
  const buffer = XLSX.write(libro, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Proyeccion por codigo ${periodLabel(period)}.xlsx"`,
    },
  });
}
