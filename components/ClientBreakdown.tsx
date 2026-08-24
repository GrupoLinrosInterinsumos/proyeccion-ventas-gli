"use client";

import { useEffect, useState } from "react";
import { formatQty } from "@/lib/format";

type Row = { partner: string; cantidad: number };

export default function ClientBreakdown({
  vendedor,
  producto_ref,
}: {
  vendedor: string;
  producto_ref: string;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ vendedor, producto_ref });
    fetch(`/api/breakdown?${params}`)
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
  }, [vendedor, producto_ref]);

  const total = rows?.reduce((s, r) => s + r.cantidad, 0) ?? 0;

  return (
    <div className="bg-surface-container-low px-4 py-3">
      <p className="mb-2 text-label-md uppercase tracking-wide text-on-surface-variant">
        A quién le vende &middot; últimos 3 meses cerrados
      </p>
      {error && <p className="text-body-sm text-secondary">{error}</p>}
      {!rows && !error && <p className="text-body-sm text-on-surface-variant">Cargando…</p>}
      {rows && rows.length === 0 && (
        <p className="text-body-sm text-on-surface-variant">Sin ventas registradas en el periodo.</p>
      )}
      {rows && rows.length > 0 && (
        <ul className="flex flex-col divide-y divide-outline-variant overflow-hidden rounded-md border border-outline-variant bg-surface-container-lowest">
          {rows.map((r) => {
            const pct = total > 0 ? (r.cantidad / total) * 100 : 0;
            return (
              <li key={r.partner} className="flex items-center gap-3 px-3 py-2">
                <span className="flex-1 truncate text-body-sm text-on-surface">{r.partner}</span>
                <span className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-container-highest">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="w-16 shrink-0 text-right text-body-sm font-medium tabular-nums text-on-surface">
                  {formatQty(r.cantidad)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
