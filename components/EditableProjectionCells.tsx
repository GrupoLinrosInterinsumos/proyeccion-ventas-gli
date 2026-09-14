"use client";

import { useState, useTransition } from "react";
import { saveProjectionAction } from "@/app/actions";
import { formatQty, formatUsd } from "@/lib/format";

export default function EditableProjectionCells({
  period,
  vendedor,
  producto_ref,
  producto_nombre,
  initialProyeccion,
  initialObservaciones,
  promedio,
  ingresoProyectado,
}: {
  period: string;
  vendedor: string;
  producto_ref: string;
  producto_nombre: string;
  initialProyeccion: number | null;
  initialObservaciones: string | null;
  promedio: number;
  ingresoProyectado: number;
}) {
  const [observaciones, setObservaciones] = useState(initialObservaciones ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [, startTransition] = useTransition();

  // The quantity itself is never edited here — it's the auto-summed total from the client
  // breakdown below (see lib/client-projections.ts's syncProductProjectionFromClients). Editing
  // it directly used to let it drift out of sync with that sum, so only observaciones is
  // editable in this row; we still echo the current proyeccion back on save so it isn't cleared.
  function persistObservaciones(next: string) {
    const fd = new FormData();
    fd.set("period", period);
    fd.set("vendedor", vendedor);
    fd.set("producto_ref", producto_ref);
    fd.set("producto_nombre", producto_nombre);
    fd.set("proyeccion", initialProyeccion?.toString() ?? "");
    fd.set("observaciones", next);

    setStatus("saving");
    startTransition(async () => {
      const res = await saveProjectionAction(fd);
      setStatus(res?.error ? "error" : "saved");
      if (!res?.error) setTimeout(() => setStatus("idle"), 1500);
    });
  }

  const delta =
    initialProyeccion !== null && promedio > 0 ? (initialProyeccion - promedio) / promedio : null;

  return (
    <>
      <td className="whitespace-nowrap px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-body-sm tabular-nums text-on-surface">
            {initialProyeccion !== null ? formatQty(initialProyeccion) : "—"}
          </span>
          {delta !== null && (
            <span
              className={`rounded px-1.5 py-0.5 text-label-sm font-medium ${
                delta >= 1
                  ? "bg-error-container text-on-error-container"
                  : delta >= 0
                    ? "bg-tertiary-fixed text-on-tertiary-fixed-variant"
                    : "bg-secondary-fixed text-on-secondary-fixed-variant"
              }`}
              title="Variación vs. promedio de 3 meses"
            >
              {delta >= 0 ? "+" : ""}
              {Math.round(delta * 100)}%
            </span>
          )}
        </div>
        {ingresoProyectado > 0 && (
          <p className="mt-0.5 text-label-sm text-on-surface-variant">{formatUsd(ingresoProyectado)}</p>
        )}
      </td>
      <td className="px-3 py-2">
        <input
          type="text"
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          onBlur={() => persistObservaciones(observaciones)}
          placeholder="Sin observaciones"
          className="w-full min-w-[180px] rounded-md border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-body-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </td>
      <td className="w-8 px-2 py-2 text-center">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full transition-opacity ${
            status === "saving"
              ? "bg-outline opacity-100"
              : status === "saved"
                ? "bg-primary opacity-100"
                : status === "error"
                  ? "bg-secondary opacity-100"
                  : "opacity-0"
          }`}
          aria-hidden
        />
      </td>
    </>
  );
}
