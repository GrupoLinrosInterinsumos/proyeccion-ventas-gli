import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSession } from "@/lib/auth";
import { getProjectionExportRows } from "@/lib/export";
import { periodLabel } from "@/lib/period";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.isAdmin) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const period = req.nextUrl.searchParams.get("period") ?? "";
  if (!period) return NextResponse.json({ error: "Falta el periodo" }, { status: 400 });

  const rows = await getProjectionExportRows(period);

  const sheet = XLSX.utils.json_to_sheet(
    rows.map((r) => ({
      Vendedor: r.vendedor,
      Sede: r.sede,
      Producto: r.producto,
      Cantidad: r.cantidad,
      "Detalle de fijado": r.fijado,
    }))
  );
  sheet["!cols"] = [{ wch: 22 }, { wch: 12 }, { wch: 50 }, { wch: 10 }, { wch: 24 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Proyeccion");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const filename = `Proyeccion ${periodLabel(period)}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
