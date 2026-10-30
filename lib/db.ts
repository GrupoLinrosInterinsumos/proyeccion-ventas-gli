type Row = Record<string, unknown>;
type Client = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Row[] }>;
  exec?: (text: string) => Promise<unknown>;
  connect?: () => Promise<{
    query: (text: string, params?: unknown[]) => Promise<{ rows: Row[] }>;
    release: () => void;
    on?: (event: "error", listener: (err: Error) => void) => void;
  }>;
};

/**
 * categoria_n2 is a property of the product, but older imports left it blank on rows (the
 * reports loaded before that column was read). Fills each blank row from the same product's
 * other rows — conservative: never overwrites a value, and a product with no category anywhere
 * stays blank. Everything that depends on the category (kg vs. und, the category filters)
 * would otherwise give different answers for the same product depending on the month.
 */
export const BACKFILL_CATEGORIA_N2_SQL = `
UPDATE sales s SET categoria_n2 = c.cat
FROM (SELECT producto_ref, MAX(NULLIF(TRIM(categoria_n2), '')) AS cat FROM sales GROUP BY producto_ref) c
WHERE s.producto_ref = c.producto_ref AND c.cat IS NOT NULL
  AND (s.categoria_n2 IS NULL OR TRIM(s.categoria_n2) = '');
`;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  vendedor TEXT UNIQUE,
  region TEXT CHECK (region IN ('LIMA','AREQUIPA','TRUJILLO')),
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_spot BOOLEAN NOT NULL DEFAULT FALSE,
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
  categoria_n2 TEXT,
  cantidad DOUBLE PRECISION NOT NULL DEFAULT 0,
  ingreso_soles DOUBLE PRECISION NOT NULL DEFAULT 0,
  precio_unitario DOUBLE PRECISION NOT NULL DEFAULT 0
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
  fijado_hasta DATE,
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (period, vendedor, producto_ref)
);

CREATE TABLE IF NOT EXISTS client_projections (
  id SERIAL PRIMARY KEY,
  period TEXT NOT NULL,
  vendedor TEXT NOT NULL,
  producto_ref TEXT NOT NULL,
  producto_nombre TEXT NOT NULL,
  partner TEXT NOT NULL,
  proyeccion_cantidad DOUBLE PRECISION,
  precio DOUBLE PRECISION,
  fijado_hasta DATE,
  alert_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (period, vendedor, producto_ref, partner)
);
CREATE INDEX IF NOT EXISTS idx_client_projections_lookup ON client_projections (vendedor, producto_ref, period);

-- Admin corrections to an already-closed month (e.g. a projected sale fell through). Never edits
-- client_projections: the export applies them on top, so the vendors' original projection stays intact.
CREATE TABLE IF NOT EXISTS projection_corrections (
  id SERIAL PRIMARY KEY,
  period TEXT NOT NULL,
  producto_ref TEXT NOT NULL,
  producto_nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('total','ajuste')),
  cantidad DOUBLE PRECISION NOT NULL,
  motivo TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  anulada_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  anulada_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_projection_corrections_period ON projection_corrections (period);

-- Where a vendedor is with each product of a projection, as they set it: no row = not opened yet.
CREATE TABLE IF NOT EXISTS product_status (
  period TEXT NOT NULL,
  vendedor TEXT NOT NULL,
  producto_ref TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('en_proceso','terminado')),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (period, vendedor, producto_ref)
);

-- Explanation a vendedor leaves when a client sold more than was projected (comparison page).
CREATE TABLE IF NOT EXISTS comparison_notes (
  id SERIAL PRIMARY KEY,
  period TEXT NOT NULL,
  vendedor TEXT NOT NULL,
  producto_ref TEXT NOT NULL,
  partner TEXT NOT NULL,
  nota TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (period, vendedor, producto_ref, partner)
);

-- Distribución: low-stock products the admin is rationing among clients — how much each client gets
-- and until which month (YYYY-MM, valid through the end of that month). One row per product + client.
CREATE TABLE IF NOT EXISTS distribuciones (
  id SERIAL PRIMARY KEY,
  producto_ref TEXT NOT NULL,
  producto_nombre TEXT NOT NULL,
  partner TEXT NOT NULL,
  cantidad DOUBLE PRECISION NOT NULL,
  hasta_mes TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (producto_ref, partner)
);

-- Clients the business treats as one: every name in "alias" is counted under "grupo" (imports, projections,
-- comparison and exports). Rows are matched ignoring case and surrounding spaces.
CREATE TABLE IF NOT EXISTS client_groups (
  alias TEXT PRIMARY KEY,
  grupo TEXT NOT NULL
);
INSERT INTO client_groups (alias, grupo) VALUES
  ('ASOCIACION ORATORIO MAYOR DON BOSCO- MAMA ASHU', 'DON BOSCO'),
  ('DIOCESIS DE HUARI', 'DON BOSCO')
ON CONFLICT (alias) DO NOTHING;

-- Fold data that was stored under an alias into its group. Idempotent: once no alias rows are left these
-- statements match nothing.
UPDATE sales SET partner = g.grupo FROM client_groups g WHERE UPPER(TRIM(sales.partner)) = UPPER(g.alias);

INSERT INTO client_projections (period, vendedor, producto_ref, producto_nombre, partner, proyeccion_cantidad, precio,
                                fijado_hasta, alert_acknowledged, updated_by, updated_at)
SELECT cp.period, cp.vendedor, cp.producto_ref, MAX(cp.producto_nombre), g.grupo, SUM(cp.proyeccion_cantidad),
       MAX(cp.precio), MAX(cp.fijado_hasta), BOOL_OR(cp.alert_acknowledged), MAX(cp.updated_by), MAX(cp.updated_at)
FROM client_projections cp JOIN client_groups g ON UPPER(TRIM(cp.partner)) = UPPER(g.alias)
GROUP BY cp.period, cp.vendedor, cp.producto_ref, g.grupo
ON CONFLICT (period, vendedor, producto_ref, partner) DO UPDATE SET
  proyeccion_cantidad = CASE WHEN client_projections.proyeccion_cantidad IS NULL AND excluded.proyeccion_cantidad IS NULL
                             THEN NULL
                             ELSE COALESCE(client_projections.proyeccion_cantidad, 0) + COALESCE(excluded.proyeccion_cantidad, 0) END,
  precio = COALESCE(client_projections.precio, excluded.precio),
  fijado_hasta = GREATEST(client_projections.fijado_hasta, excluded.fijado_hasta),
  updated_by = COALESCE(client_projections.updated_by, excluded.updated_by);
DELETE FROM client_projections cp USING client_groups g WHERE UPPER(TRIM(cp.partner)) = UPPER(g.alias);

INSERT INTO comparison_notes (period, vendedor, producto_ref, partner, nota, updated_by, updated_at)
SELECT n.period, n.vendedor, n.producto_ref, g.grupo, MAX(n.nota), MAX(n.updated_by), MAX(n.updated_at)
FROM comparison_notes n JOIN client_groups g ON UPPER(TRIM(n.partner)) = UPPER(g.alias)
GROUP BY n.period, n.vendedor, n.producto_ref, g.grupo
ON CONFLICT (period, vendedor, producto_ref, partner) DO NOTHING;
DELETE FROM comparison_notes n USING client_groups g WHERE UPPER(TRIM(n.partner)) = UPPER(g.alias);

INSERT INTO distribuciones (producto_ref, producto_nombre, partner, cantidad, hasta_mes, created_by, updated_by)
SELECT x.producto_ref, MAX(x.producto_nombre), g.grupo, SUM(x.cantidad), MAX(x.hasta_mes), MAX(x.created_by), MAX(x.updated_by)
FROM distribuciones x JOIN client_groups g ON UPPER(TRIM(x.partner)) = UPPER(g.alias)
GROUP BY x.producto_ref, g.grupo
ON CONFLICT (producto_ref, partner) DO UPDATE SET
  cantidad = distribuciones.cantidad + excluded.cantidad,
  hasta_mes = GREATEST(distribuciones.hasta_mes, excluded.hasta_mes);
DELETE FROM distribuciones d USING client_groups g WHERE UPPER(TRIM(d.partner)) = UPPER(g.alias);

-- Idempotent migrations for tables that already existed before these columns were added.
ALTER TABLE imports ADD COLUMN IF NOT EXISTS data_hasta DATE;
ALTER TABLE users ALTER COLUMN vendedor DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_spot BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS categoria_n2 TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS precio_unitario DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE projections ADD COLUMN IF NOT EXISTS fijado_hasta DATE;
${BACKFILL_CATEGORIA_N2_SQL}
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
    // Without this, a dropped idle connection crashes the whole process (node-postgres
    // emits 'error' on the pool instead of rejecting a promise) — see node-postgres#1324.
    pool.on("error", (err) => {
      console.error("Unexpected Postgres pool error:", err.message);
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
    conn.on?.("error", () => {
      /* swallowed: the failing query's own promise rejection is what we act on below */
    });
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
