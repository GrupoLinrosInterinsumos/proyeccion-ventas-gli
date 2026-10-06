import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getProjectionExportRows, buildExportWorkbookBuffer } from "@/lib/export";
import { periodLabel } from "@/lib/period";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !session.isAdmin) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const period = req.nextUrl.searchParams.get("period") ?? "";
  if (!period) return NextResponse.json({ error: "Falta el periodo" }, { status: 400 });

  const rows = await getProjectionExportRows(period);
  const buffer = buildExportWorkbookBuffer(rows);

  const filename = `Proyeccion ${periodLabel(period)}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
