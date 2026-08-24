import fs from "node:fs";
import bcrypt from "bcryptjs";
import { query } from "../lib/db";
import { parseSalesWorkbook } from "../lib/import-excel";
import { commitImport } from "../lib/import-commit";
import type { Region } from "../lib/regions";

const DEFAULT_PASSWORD = "Ventas2026";
// Vendedor name (as it appears in the "Vendedor" column) that should get admin rights.
const ADMIN_VENDEDOR = "GABRIELA GONZALEZ";
const ADMIN_EMAIL = "g.gonzalez@gli.pe";

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function emailFor(vendedor: string): string {
  const clean = stripAccents(vendedor).toLowerCase().replace(/[^a-z\s]/g, "").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  const slug = parts.length > 1 ? `${parts[0]}.${parts[parts.length - 1]}` : parts[0] || "usuario";
  return `${slug}@gli.pe`;
}

async function main() {
  const sourcePath =
    process.argv[2] ||
    "C:/Users/HP/Desktop/Carpetas/REPORTE DE VENTAS 2026- GLI/JULIO/REPORTE SIN COSTOS -JULIO 2026.xlsx";

  if (fs.existsSync(sourcePath)) {
    const buffer = fs.readFileSync(sourcePath);
    const parsed = parseSalesWorkbook(buffer);
    await commitImport(parsed, sourcePath.split(/[\\/]/).pop() ?? "seed.xlsx", null);
    console.log(
      `Importados ${parsed.rows.length} registros agregados de ${parsed.sourceRowCount} filas fuente. Periodos: ${parsed.periods.join(", ")}`
    );
    if (parsed.warnings.length) console.log("Avisos:", parsed.warnings.join(" | "));
  } else {
    console.log(`Archivo de datos inicial no encontrado en ${sourcePath}; se omite la carga inicial.`);
  }

  const vendedorRows = await query<{ vendedor: string; region: Region; cnt: number }>(
    `SELECT vendedor, region, COUNT(*)::int as cnt FROM sales GROUP BY vendedor, region`
  );

  if (vendedorRows.length === 0) {
    console.log("No hay vendedores en la tabla sales todavía; no se crearon usuarios.");
    console.log("Sube un archivo desde /importar y vuelve a correr `npm run seed` para generar logins.");
    return;
  }

  const dominantRegion = new Map<string, { region: Region; cnt: number }>();
  for (const row of vendedorRows) {
    const current = dominantRegion.get(row.vendedor);
    if (!current || row.cnt > current.cnt) dominantRegion.set(row.vendedor, { region: row.region, cnt: row.cnt });
  }

  let created = 0;
  let skipped = 0;

  for (const [vendedor, info] of dominantRegion) {
    const isAdmin = stripAccents(vendedor).toUpperCase() === ADMIN_VENDEDOR;
    const email = isAdmin ? ADMIN_EMAIL : emailFor(vendedor);
    const name = titleCase(vendedor);

    try {
      const result = await query(
        `INSERT INTO users (name, email, password_hash, vendedor, region, is_admin)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (vendedor) DO NOTHING
         RETURNING id`,
        [name, email, bcrypt.hashSync(DEFAULT_PASSWORD, 10), vendedor, info.region, isAdmin]
      );

      if (result.length > 0) {
        created++;
        console.log(`+ ${name} <${email}> (${info.region}${isAdmin ? ", admin" : ""})`);
      } else {
        skipped++;
      }
    } catch (err) {
      console.warn(
        `! No se pudo crear usuario para "${vendedor}" (${email}): ${err instanceof Error ? err.message : err}`
      );
    }
  }

  console.log(
    `Usuarios: ${created} creado(s), ${skipped} ya existían. Contraseña por defecto para nuevos usuarios: "${DEFAULT_PASSWORD}"`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
