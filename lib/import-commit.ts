import { withTransaction } from "./db";
import type { ParseResult } from "./import-excel";

/**
 * Replaces all sales data for every period present in the parsed file (the monthly export
 * is cumulative year-to-date), then re-inserts the freshly aggregated rows.
 */
export async function commitImport(
  parsed: ParseResult,
  filename: string,
  uploadedBy: number | null
): Promise<void> {
  await withTransaction(async (q) => {
    for (const period of parsed.periods) {
      await q(`DELETE FROM sales WHERE period = $1`, [period]);
    }
    for (const row of parsed.rows) {
      await q(
        `INSERT INTO sales (period, region, vendedor, partner, producto_ref, producto_nombre, marca, categoria, cantidad, ingreso_soles)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          row.period,
          row.region,
          row.vendedor,
          row.partner,
          row.producto_ref,
          row.producto_nombre,
          row.marca,
          row.categoria,
          row.cantidad,
          row.ingreso_soles,
        ]
      );
    }
    await q(`INSERT INTO imports (filename, periods_json, row_count, uploaded_by) VALUES ($1,$2,$3,$4)`, [
      filename,
      JSON.stringify(parsed.periods),
      parsed.rows.length,
      uploadedBy,
    ]);
  });
}
