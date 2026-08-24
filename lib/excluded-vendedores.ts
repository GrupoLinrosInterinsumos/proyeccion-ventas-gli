/**
 * Vendedores that should never be imported, shown, or logged in as — e.g. people who no
 * longer work at GLI. Sales rows for these names are dropped at import time, so they never
 * reach the `sales` table (and therefore never get a user account via `npm run seed` either).
 */
const EXCLUDED_VENDEDORES = ["CINTHIA BERMUDES", "MALORI SILVA", "NELIDY HUAITA"];

function normalize(name: string): string {
  // Strip Unicode combining diacritical marks (U+0300–U+036F) left behind by NFD
  // normalization, so accented and unaccented spellings compare equal.
  const stripped = name
    .normalize("NFD")
    .split("")
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < 0x0300 || code > 0x036f;
    })
    .join("");
  return stripped.toUpperCase().trim().replace(/\s+/g, " ");
}

const EXCLUDED_SET = new Set(EXCLUDED_VENDEDORES.map(normalize));

export function isExcludedVendedor(name: string): boolean {
  return EXCLUDED_SET.has(normalize(name));
}
