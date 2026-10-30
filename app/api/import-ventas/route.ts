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
const MAX_BYTES = 8_000_000;

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

  // The free hosting tier has little memory: a full year-to-date report (~20 MB) can take the whole
  // service down while it is parsed. The daily job sends only the current month; refuse anything big
  // before reading the body.
  const size = Number(req.headers.get("content-length") ?? 0);
  if (size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Archivo demasiado grande (${(size / 1e6).toFixed(1)} MB; máximo ${MAX_BYTES / 1e6} MB). Sube solo el mes en curso.` },
      { status: 413 }
    );
  }

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
