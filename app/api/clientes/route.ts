import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";

/**
 * Existing clients matching what is being typed in "Agregar cliente": every distinct client in the
 * sales, the vendedor's own first, flagging the ones already listed under the product. Matching
 * ignores case and accents.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const p = req.nextUrl.searchParams;
  const term = (p.get("q") ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const vendedor = p.get("vendedor") ?? "";
  const producto_ref = p.get("producto_ref") ?? "";
  const period = p.get("period") ?? "";
  if (term.length < 2) return NextResponse.json({ clientes: [] });
  if (!session.isAdmin && session.vendedor !== vendedor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const clientes = await query<{ partner: string; propio: boolean; en_lista: boolean }>(
    `WITH c AS (
       SELECT COALESCE(NULLIF(TRIM(partner), ''), 'Sin cliente registrado') AS partner,
              BOOL_OR(vendedor = $2) AS propio
       FROM sales GROUP BY 1
     )
     SELECT c.partner, c.propio,
            EXISTS (SELECT 1 FROM client_projections cp
                    WHERE cp.period = $3 AND cp.vendedor = $2 AND cp.producto_ref = $4
                      AND LOWER(cp.partner) = LOWER(c.partner)) AS en_lista
     FROM c
     WHERE translate(lower(c.partner), 'áéíóúüñ', 'aeiouun') LIKE $1
     ORDER BY c.propio DESC, c.partner
     LIMIT 12`,
    [`%${term.replace(/[%_\\]/g, "")}%`, vendedor, period, producto_ref]
  );
  return NextResponse.json({ clientes });
}
