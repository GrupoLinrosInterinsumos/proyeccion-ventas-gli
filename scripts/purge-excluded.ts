import { query } from "../lib/db";

/**
 * Removes any sales/projections/users left over from before a name was added to
 * lib/excluded-vendedores.ts. New imports already skip these vendedores automatically —
 * this just cleans out what's already in the database. Safe to re-run any time.
 */
async function main() {
  const vendedores = await query<{ vendedor: string }>(`SELECT DISTINCT vendedor FROM sales
     UNION SELECT DISTINCT vendedor FROM users`);

  const { isExcludedVendedor } = await import("../lib/excluded-vendedores");
  const toPurge = vendedores.map((v) => v.vendedor).filter((v) => isExcludedVendedor(v));

  if (toPurge.length === 0) {
    console.log("No hay vendedores excluidos con datos pendientes de limpiar.");
    return;
  }

  for (const vendedor of toPurge) {
    const sales = await query(`DELETE FROM sales WHERE vendedor = $1 RETURNING id`, [vendedor]);
    const projections = await query(`DELETE FROM projections WHERE vendedor = $1 RETURNING id`, [vendedor]);
    const users = await query(`DELETE FROM users WHERE vendedor = $1 RETURNING id`, [vendedor]);
    console.log(
      `- ${vendedor}: ${sales.length} ventas, ${projections.length} proyecciones, ${users.length} usuario(s) eliminados`
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
