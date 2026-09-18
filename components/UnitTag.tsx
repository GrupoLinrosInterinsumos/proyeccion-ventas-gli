import type { Unit } from "@/lib/units";

/** Small unit label shown next to a quantity: "kg", or "und" for units (SACCO). */
export default function UnitTag({ unit }: { unit: Unit }) {
  return (
    <span
      className="ml-1 rounded bg-surface-container-high px-1 py-0.5 text-label-sm font-normal lowercase text-on-surface-variant"
      title={unit === "kg" ? "Kilogramos" : "Unidades"}
    >
      {unit}
    </span>
  );
}
