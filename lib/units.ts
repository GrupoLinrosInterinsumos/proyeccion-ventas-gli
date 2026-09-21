export type Unit = "kg" | "und";

/** Quantities are kilograms, except the SACCO category (starter cultures), sold by the unit. */
export function unitForCategoria(categoria: string | null | undefined): Unit {
  return categoria?.trim().toUpperCase() === "SACCO" ? "und" : "kg";
}

/** SQL condition: true when the given categoria_n2 column is the SACCO (units) category. */
export function saccoCondition(column = "categoria_n2"): string {
  return `UPPER(TRIM(COALESCE(${column}, ''))) = 'SACCO'`;
}

/** A quantity total kept apart by unit — kilograms and units must never be added together. */
export type QtySplit = { kg: number; und: number };

export const emptyQty = (): QtySplit => ({ kg: 0, und: 0 });

export function addQty(acc: QtySplit, unit: Unit, amount: number): void {
  acc[unit] += amount;
}

/** True when what was sold more than doubled what was projected, in kg or in units. */
export function isExcedido(proyectado: QtySplit, real: QtySplit): boolean {
  return (
    (proyectado.kg > 0 && real.kg > proyectado.kg * 2) || (proyectado.und > 0 && real.und > proyectado.und * 2)
  );
}

/**
 * Relative change of a proyección vs. its promedio (0.25 = +25%). Measured on kilograms, or on
 * units when there are no kilograms — the two are never mixed into one ratio.
 */
export function qtyDelta(promedio: QtySplit, proyeccion: QtySplit): number | null {
  if (promedio.kg > 0) return (proyeccion.kg - promedio.kg) / promedio.kg;
  if (promedio.und > 0) return (proyeccion.und - promedio.und) / promedio.und;
  return null;
}
