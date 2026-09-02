import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getClientProjections } from "@/lib/client-projections";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const vendedor = req.nextUrl.searchParams.get("vendedor") ?? "";
  const producto_ref = req.nextUrl.searchParams.get("producto_ref") ?? "";
  const period = req.nextUrl.searchParams.get("period") ?? "";

  if (!vendedor || !producto_ref || !period) {
    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  }
  if (!session.isAdmin && session.vendedor !== vendedor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const rows = await getClientProjections(vendedor, producto_ref, period);
  return NextResponse.json({ rows });
}
