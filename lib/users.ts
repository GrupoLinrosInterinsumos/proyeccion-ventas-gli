import { query, queryOne } from "./db";
import type { Region } from "./regions";

export type UserListRow = {
  id: number;
  name: string;
  email: string;
  vendedor: string | null;
  region: Region | null;
  is_admin: boolean;
  is_spot: boolean;
  created_at: string;
};

export async function listUsers(): Promise<UserListRow[]> {
  return query<UserListRow>(
    `SELECT id, name, email, vendedor, region, is_admin, is_spot, created_at FROM users ORDER BY name`
  );
}

export async function countAdmins(): Promise<number> {
  const row = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int as count FROM users WHERE is_admin = TRUE`
  );
  return row?.count ?? 0;
}

export async function searchVendedores(q: string, region?: Region): Promise<UserListRow[]> {
  const params: unknown[] = [`%${q}%`];
  let where = `(name ILIKE $1 OR vendedor ILIKE $1)`;
  if (region) {
    params.push(region);
    where += ` AND region = $2`;
  }
  return query<UserListRow>(
    `SELECT id, name, email, vendedor, region, is_admin, is_spot, created_at FROM users
     WHERE ${where}
     ORDER BY name`,
    params
  );
}

/** Vendedores with sales history but no login yet — useful to suggest when adding a user. */
export async function getUnclaimedVendedores(): Promise<string[]> {
  const rows = await query<{ vendedor: string }>(
    `SELECT DISTINCT vendedor FROM sales
     WHERE vendedor NOT IN (SELECT vendedor FROM users WHERE vendedor IS NOT NULL)
     ORDER BY vendedor`
  );
  return rows.map((r) => r.vendedor);
}
