type Row = Record<string, unknown>;
type Client = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Row[] }>;
  exec?: (text: string) => Promise<unknown>;
  connect?: () => Promise<{
    query: (text: string, params?: unknown[]) => Promise<{ rows: Row[] }>;
    release: () => void;
  }>;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  vendedor TEXT NOT NULL UNIQUE,
  region TEXT CHECK (region IN ('LIMA','AREQUIPA','TRUJILLO')),
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY,
  period TEXT NOT NULL,
  region TEXT NOT NULL,
  vendedor TEXT NOT NULL,
  partner TEXT,
  producto_ref TEXT NOT NULL,
  producto_nombre TEXT NOT NULL,
  marca TEXT,
  categoria TEXT,
  cantidad DOUBLE PRECISION NOT NULL DEFAULT 0,
  ingreso_soles DOUBLE PRECISION NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sales_lookup ON sales (vendedor, producto_ref, period);
CREATE INDEX IF NOT EXISTS idx_sales_period ON sales (period);
CREATE INDEX IF NOT EXISTS idx_sales_region ON sales (region);

CREATE TABLE IF NOT EXISTS imports (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  periods_json TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  uploaded_by INTEGER REFERENCES users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projections (
  id SERIAL PRIMARY KEY,
  period TEXT NOT NULL,
  vendedor TEXT NOT NULL,
  producto_ref TEXT NOT NULL,
  producto_nombre TEXT NOT NULL,
  proyeccion DOUBLE PRECISION,
  observaciones TEXT,
  is_manual BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (period, vendedor, producto_ref)
);
`;

async function createClient(): Promise<Client> {
  if (process.env.DATABASE_URL) {
    const { Pool } = await import("pg");
    const needsSsl =
      process.env.PGSSLMODE === "require" ||
      /render\.com|amazonaws\.com|neon\.tech|supabase\.co/.test(process.env.DATABASE_URL);
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    });
    return pool as unknown as Client;
  }

  // Local development fallback: a real embedded Postgres (WASM), no external service needed.
  const { PGlite } = await import("@electric-sql/pglite");
  const path = await import("node:path");
  const fs = await import("node:fs");
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const pglite = await PGlite.create(path.join(dataDir, "pglite"));
  return pglite as unknown as Client;
}

declare global {
  // eslint-disable-next-line no-var
  var __dbClientPromise: Promise<Client> | undefined;
}

function getClient(): Promise<Client> {
  if (!global.__dbClientPromise) {
    global.__dbClientPromise = createClient().then(async (client) => {
      // PGlite's query() only accepts a single statement; exec() runs a multi-statement script.
      if (client.exec) await client.exec(SCHEMA);
      else await client.query(SCHEMA);
      return client;
    });
  }
  return global.__dbClientPromise;
}

export async function query<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = await getClient();
  const res = await client.query(text, params);
  return res.rows as T[];
}

export async function queryOne<T extends Row = Row>(
  text: string,
  params: unknown[] = []
): Promise<T | undefined> {
  const rows = await query<T>(text, params);
  return rows[0];
}

type Tx = (q: <T extends Row = Row>(text: string, params?: unknown[]) => Promise<T[]>) => Promise<void>;

export async function withTransaction(fn: Tx): Promise<void> {
  const client = await getClient();

  // A pooled pg.Pool hands out a different connection per query, so BEGIN/COMMIT must be
  // pinned to one checked-out connection. PGlite is a single connection already.
  if (client.connect) {
    const conn = await client.connect();
    const q = async <T extends Row = Row>(text: string, params: unknown[] = []) =>
      (await conn.query(text, params)).rows as T[];
    try {
      await q("BEGIN");
      await fn(q);
      await q("COMMIT");
    } catch (err) {
      await q("ROLLBACK");
      throw err;
    } finally {
      conn.release();
    }
    return;
  }

  const q = async <T extends Row = Row>(text: string, params: unknown[] = []) =>
    (await client.query(text, params)).rows as T[];
  try {
    await q("BEGIN");
    await fn(q);
    await q("COMMIT");
  } catch (err) {
    await q("ROLLBACK");
    throw err;
  }
}
