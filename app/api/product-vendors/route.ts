import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getProductVendorBreakdown } from "@/lib/sales";
import { isRegion } from "@/lib/regions";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!session.isAdmin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const producto_ref = req.nextUrl.searchParams.get("producto_ref") ?? "";
  const period = req.nextUrl.searchParams.get("period") ?? "";
  const regionParam = req.nextUrl.searchParams.get("region");
  const region = isRegion(regionParam) ? regionParam : undefined;

  if (!producto_ref || !period) {
    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  }

  const rows = await getProductVendorBreakdown(producto_ref, period, region);
  return NextResponse.json({ rows });
}
