import { withTransaction } from "./db";
import type { AggregatedSaleRow, ParseResult } from "./import-excel";

const SALES_COLUMNS = [
  "period",
  "region",
  "vendedor",
  "partner",
  "producto_ref",
  "producto_nombre",
  "marca",
  "categoria",
  "categoria_n2",
  "cantidad",
  "ingreso_soles",
] as const;

const BATCH_SIZE = 500;

/**
 * Replaces all sales data for every period present in the parsed file (the monthly export
 * is cumulative year-to-date), then re-inserts the freshly aggregated rows.
 *
 * Inserts are batched (multi-row VALUES) instead of one row per round trip — with a remote
 * database this file can be 25k+ rows, and one INSERT per row is both slow enough to hit
 * timeouts and holds the transaction open long enough to risk a dropped connection.
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

    for (let i = 0; i < parsed.rows.length; i += BATCH_SIZE) {
      const chunk: AggregatedSaleRow[] = parsed.rows.slice(i, i + BATCH_SIZE);
      const values: unknown[] = [];
      const placeholders = chunk
        .map((row, rowIdx) => {
          const base = rowIdx * SALES_COLUMNS.length;
          values.push(
            row.period,
            row.region,
            row.vendedor,
            row.partner,
            row.producto_ref,
            row.producto_nombre,
            row.marca,
            row.categoria,
            row.categoria_n2,
            row.cantidad,
            row.ingreso_soles
          );
          return `(${SALES_COLUMNS.map((_, colIdx) => `$${base + colIdx + 1}`).join(",")})`;
        })
        .join(",");

      await q(
        `INSERT INTO sales (${SALES_COLUMNS.join(",")}) VALUES ${placeholders}`,
        values
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
