export type Unit = "kg" | "und";

/** Quantities are kilograms, except the SACCO category (starter cultures), sold by the unit. */
export function unitForCategoria(categoria: string | null | undefined): Unit {
  return categoria?.trim().toUpperCase() === "SACCO" ? "und" : "kg";
}
