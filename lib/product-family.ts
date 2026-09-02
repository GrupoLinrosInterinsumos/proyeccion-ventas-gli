/**
 * Many product codes are size/package variants of the same underlying item — e.g.
 * ACEK1-061-001, ACEK1-061-005, ACEK1-061-025 are 1kg/5kg/25kg packs of the same
 * "ACESULFAME K JINHE". The ref is stable up to the second dash; that's the family key.
 */
export function productFamilyKey(producto_ref: string): string {
  const parts = producto_ref.split("-");
  return parts.slice(0, 2).join("-");
}

const SIZE_RE = /X\s*([\d.,]+)\s*(kg|gr|g)\b/i;

/** Parses the "X 25kg" / "X 250g" suffix in a product name into grams, for comparing package sizes. */
export function parseSizeGrams(producto_nombre: string): number {
  const m = producto_nombre.match(SIZE_RE);
  if (!m) return 0;
  const num = parseFloat(m[1].replace(",", "."));
  if (Number.isNaN(num)) return 0;
  return m[2].toLowerCase().startsWith("kg") ? num * 1000 : num;
}
