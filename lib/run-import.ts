import { parseSalesWorkbook, type ParseResult } from "./import-excel";
import { commitImport } from "./import-commit";
import { ensureOpenPeriodDefaults } from "./client-projections";
import { openProjectionPeriod, periodoReabierto } from "./period";

/**
 * The whole import: parse the sales report, replace the sales of the periods it carries and
 * re-derive the untouched default projections of the open period from the fresh sales (anything a
 * vendedor edited or pinned is left alone — and nothing at all while a closed month is reopened for
 * corrections, so the numbers the vendedores are fixing do not move under them). Shared by the admin upload screen and the token-protected
 * endpoint a scheduled job uses to refresh the data every day.
 */
export async function importSalesFile(buffer: Buffer, filename: string, uploadedBy: number | null): Promise<ParseResult> {
  const parsed = parseSalesWorkbook(buffer);
  await commitImport(parsed, filename, uploadedBy);
  await ensureOpenPeriodDefaults(openProjectionPeriod(), { rebuild: periodoReabierto() === null });
  return parsed;
}
