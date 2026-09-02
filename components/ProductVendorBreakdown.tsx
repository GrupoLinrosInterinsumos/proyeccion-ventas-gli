"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatQty } from "@/lib/format";
import { REGION_LABELS, type Region } from "@/lib/regions";

type Row = { vendedor: string; region: Region; promedio_mensual: number; proyeccion: number | null };

export default function ProductVendorBreakdown({
  producto_ref,
  period,
  region,
}: {
  producto_ref: string;
  period: string;
  region?: Region;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ producto_ref, period, ...(region ? { region } : {}) });
    fetch(`/api/product-vendors?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) setError(data.error);
        else setRows(data.rows);
      })
      .catch(() => !cancelled && setError("No se pudo cargar."));
    return () => {
      cancelled = true;
    };
  }, [producto_ref, period, region]);

  const max = Math.max(...(rows?.map((r) => r.promedio_mensual) ?? []), 1);

  return (
    <div className="bg-surface-container-low px-4 py-3">
      <p className="mb-2 text-label-md uppercase tracking-wide text-on-surface-variant">
        Vendedores que lo venden &middot; últimos 3 meses cerrados
      </p>
      {error && <p className="text-body-sm text-secondary">{error}</p>}
      {!rows && !error && <p className="text-body-sm text-on-surface-variant">Cargando…</p>}
      {rows && rows.length === 0 && (
        <p className="text-body-sm text-on-surface-variant">Sin ventas registradas en el periodo.</p>
      )}
      {rows && rows.length > 0 && (
        <ul className="flex flex-col divide-y divide-outline-variant overflow-hidden rounded-md border border-outline-variant bg-surface-container-lowest">
          {rows.map((r) => {
            const pct = max > 0 ? (r.promedio_mensual / max) * 100 : 0;
            const delta =
              r.proyeccion !== null && r.promedio_mensual > 0
                ? ((r.proyeccion - r.promedio_mensual) / r.promedio_mensual) * 100
                : null;
            return (
              <li key={r.vendedor} className="flex items-center gap-3 px-3 py-2">
                <Link
                  href={`/dashboard?vendedor=${encodeURIComponent(r.vendedor)}`}
                  className="flex-1 truncate text-body-sm text-on-surface hover:text-primary hover:underline"
                >
                  {r.vendedor}
                  <span className="ml-1.5 text-label-sm text-on-surface-variant">
                    {REGION_LABELS[r.region]}
                  </span>
                </Link>
                <span className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-surface-container-highest">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </span>
                <span className="w-14 shrink-0 text-right text-body-sm font-medium tabular-nums text-on-surface">
                  {formatQty(r.promedio_mensual)}
                </span>
                <span className="w-20 shrink-0 text-right text-body-sm tabular-nums text-on-surface-variant">
                  {r.proyeccion !== null ? formatQty(r.proyeccion) : "—"}
                </span>
                {delta !== null ? (
                  <span
                    className={`w-12 shrink-0 rounded px-1.5 py-0.5 text-right text-label-sm font-medium ${
                      delta >= 0
                        ? "bg-tertiary-fixed text-on-tertiary-fixed-variant"
                        : "bg-secondary-fixed text-on-secondary-fixed-variant"
                    }`}
                  >
                    {delta >= 0 ? "+" : ""}
                    {Math.round(delta)}%
                  </span>
                ) : (
                  <span className="w-12 shrink-0" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
