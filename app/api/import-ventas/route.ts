import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { importSalesFile } from "@/lib/run-import";

/**
 * Daily refresh of the sales data for the comparison page: a scheduled job posts the latest sales
 * report (.xlsx, sheet DATA — the same file "Importar data" takes) and it is imported exactly like
 * a manual upload.
 *
 *   curl -X POST -H "Authorization: Bearer <IMPORT_TOKEN>" -F "file=@reporte.xlsx" <url>/api/import-ventas
 *
 * Only works with `Authorization: Bearer <IMPORT_TOKEN>`; without IMPORT_TOKEN configured the
 * endpoint is disabled. (Writes data, so it uses its own token, separate from EXPORT_TOKEN.)
 */
export const maxDuration = 300;

function tokenValido(req: NextRequest, esperado: string): boolean {
  const recibido = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const esperado = process.env.IMPORT_TOKEN;
  if (!esperado) return NextResponse.json({ error: "Importación automática no configurada" }, { status: 503 });
  if (!tokenValido(req, esperado)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  let file: FormDataEntryValue | null;
  try {
    file = (await req.formData()).get("file");
  } catch {
    return NextResponse.json({ error: "Envía el archivo como multipart/form-data en el campo 'file'" }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Falta el archivo .xlsx en el campo 'file'" }, { status: 400 });
  }

  try {
    const parsed = await importSalesFile(Buffer.from(await file.arrayBuffer()), file.name, null);
    for (const path of ["/ventas", "/dashboard", "/comparacion", "/importar"]) revalidatePath(path);
    return NextResponse.json({
      ok: true,
      registros: parsed.rows.length,
      periodos: parsed.periods,
      datos_hasta: parsed.hasta,
      avisos: parsed.warnings,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error al procesar el archivo." }, { status: 422 });
  }
}
