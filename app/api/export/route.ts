import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSession } from "@/lib/auth";
import { getProjectionExportRows, summarizeExportByProduct } from "@/lib/export";
import { periodLabel } from "@/lib/period";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.isAdmin) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const period = req.nextUrl.searchParams.get("period") ?? "";
  if (!period) return NextResponse.json({ error: "Falta el periodo" }, { status: 400 });

  const rows = await getProjectionExportRows(period);
  const summary = summarizeExportByProduct(rows);

  const detailSheet = XLSX.utils.json_to_sheet(
    rows.map((r) => ({
      Vendedor: r.vendedor,
      Sede: r.sede,
      Producto: r.producto,
      Cantidad: r.cantidad,
      "Detalle de fijado": r.fijado,
    }))
  );
  detailSheet["!cols"] = [{ wch: 22 }, { wch: 12 }, { wch: 50 }, { wch: 10 }, { wch: 24 }];

  const summarySheet = XLSX.utils.json_to_sheet(
    summary.map((r) => ({
      Producto: r.producto,
      "Total proyectado": r.cantidad_total,
      Vendedores: r.vendedores,
    }))
  );
  summarySheet["!cols"] = [{ wch: 50 }, { wch: 16 }, { wch: 60 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, detailSheet, "Proyeccion");
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumen por producto");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const filename = `Proyeccion ${periodLabel(period)}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
