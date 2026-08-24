import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getClientBreakdown } from "@/lib/sales";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const vendedor = req.nextUrl.searchParams.get("vendedor") ?? "";
  const producto_ref = req.nextUrl.searchParams.get("producto_ref") ?? "";

  if (!vendedor || !producto_ref) {
    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  }
  if (!session.isAdmin && session.vendedor !== vendedor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const rows = await getClientBreakdown(vendedor, producto_ref);
  return NextResponse.json({ rows });
}
