import { query } from "./db";
import type { AggregatedSaleRow } from "./import-excel";

const norm = (s: string) => s.trim().toUpperCase();

type GroupRow = { alias: string; grupo: string };

export function toGroupMap(rows: GroupRow[]): Map<string, string> {
  return new Map(rows.map((r) => [norm(r.alias), r.grupo]));
}

/** alias (normalized) → group name, from the `client_groups` table. */
export async function loadClientGroups(): Promise<Map<string, string>> {
  return toGroupMap(await query<GroupRow>(`SELECT alias, grupo FROM client_groups`));
}

/** The group a client name belongs to, or the name itself when it is not part of any group. */
export function grupoDe(partner: string, groups: Map<string, string>): string {
  return groups.get(norm(partner)) ?? partner;
}

/**
 * Renames clients to their group and folds the rows that now share the same key (period, team, vendedor,
 * product, client) into one: quantities and revenue add up and the unit price is averaged by quantity.
 */
export function applyClientGroups(rows: AggregatedSaleRow[], groups: Map<string, string>): AggregatedSaleRow[] {
  if (groups.size === 0) return rows;
  const out: AggregatedSaleRow[] = [];
  const merged = new Map<string, AggregatedSaleRow>();
  for (const row of rows) {
    const grupo = grupoDe(row.partner, groups);
    if (grupo === row.partner) {
      out.push(row);
      continue;
    }
    const key = `${row.period}::${row.region}::${row.vendedor}::${row.producto_ref}::${grupo}`;
    const prev = merged.get(key);
    if (!prev) {
      const copy = { ...row, partner: grupo };
      merged.set(key, copy);
      out.push(copy);
      continue;
    }
    const total = prev.cantidad + row.cantidad;
    prev.precio_unitario =
      total > 0 ? (prev.precio_unitario * prev.cantidad + row.precio_unitario * row.cantidad) / total : prev.precio_unitario;
    prev.cantidad = total;
    prev.ingreso_soles += row.ingreso_soles;
  }
  return out;
}
