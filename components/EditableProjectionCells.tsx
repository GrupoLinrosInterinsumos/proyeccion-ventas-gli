"use client";

import { useState, useTransition } from "react";
import { saveProjectionAction } from "@/app/actions";
import { formatUsd } from "@/lib/format";

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
  const [proyeccion, setProyeccion] = useState(initialProyeccion?.toString() ?? "");
  const [observaciones, setObservaciones] = useState(initialObservaciones ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [, startTransition] = useTransition();

  function persist(next: { proyeccion?: string; observaciones?: string }) {
    const fd = new FormData();
    fd.set("period", period);
    fd.set("vendedor", vendedor);
    fd.set("producto_ref", producto_ref);
    fd.set("producto_nombre", producto_nombre);
    fd.set("proyeccion", next.proyeccion ?? proyeccion);
    fd.set("observaciones", next.observaciones ?? observaciones);

    setStatus("saving");
    startTransition(async () => {
      const res = await saveProjectionAction(fd);
      setStatus(res?.error ? "error" : "saved");
      if (!res?.error) setTimeout(() => setStatus("idle"), 1500);
    });
  }

  const proyeccionNum = proyeccion.trim() === "" ? null : Number(proyeccion);
  const delta =
    proyeccionNum !== null && promedio > 0 ? (proyeccionNum - promedio) / promedio : null;

  return (
    <>
      <td className="whitespace-nowrap px-3 py-2">
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            step="1"
            value={proyeccion}
            onChange={(e) => setProyeccion(e.target.value)}
            onBlur={() => {
              const rounded = proyeccion.trim() === "" ? "" : String(Math.round(Number(proyeccion)));
              setProyeccion(rounded);
              persist({ proyeccion: rounded });
            }}
            placeholder="—"
            className="w-24 rounded-md border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-body-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {delta !== null && (
            <span
              className={`rounded px-1.5 py-0.5 text-label-sm font-medium ${
                delta >= 0
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
          onBlur={() => persist({ observaciones })}
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
