"use client";

import { Fragment, useState } from "react";
import { formatQty } from "@/lib/format";
import type { ProductBreakdownRow } from "@/lib/sales";
import type { Region } from "@/lib/regions";
import ProductVendorBreakdown from "./ProductVendorBreakdown";

export default function ProductBreakdownCard({
  products,
  period,
  region,
  title = "Por producto",
}: {
  products: ProductBreakdownRow[];
  period: string;
  region?: Region;
  title?: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const max = Math.max(...products.map((p) => p.promedio_mensual), 1);

  return (
    <section className="rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm shadow-black/[0.04]">
      <h2 className="flex items-center gap-2.5 border-b border-outline-variant px-5 py-3.5 text-body-lg font-semibold text-on-surface">
        <span className="h-2 w-2 rounded-full bg-tertiary" aria-hidden />
        {title}
      </h2>
      {products.length === 0 ? (
        <p className="px-5 py-6 text-body-sm text-on-surface-variant">Sin datos para este filtro.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-outline-variant">
          {products.map((p) => {
            const isOpen = expanded === p.producto_ref;
            return (
              <Fragment key={p.producto_ref}>
                <li
                  className="cursor-pointer px-5 py-3 hover:bg-surface-container-low"
                  onClick={() => setExpanded(isOpen ? null : p.producto_ref)}
                >
                  <div className="mb-1 flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-1.5">
                      <span
                        className={`mt-0.5 shrink-0 text-on-surface-variant transition-transform ${isOpen ? "rotate-90" : ""}`}
                        aria-hidden
                      >
                        ›
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-body-sm font-medium text-on-surface">{p.producto_nombre}</p>
                        <p className="truncate text-label-sm text-on-surface-variant">
                          {p.categoria ?? "Sin categoría"}
                          {p.marca ? ` · ${p.marca}` : ""} · {p.vendedores} vendedor{p.vendedores === 1 ? "" : "es"}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-body-sm font-semibold tabular-nums text-on-surface">
                        {formatQty(p.promedio_mensual)}
                      </p>
                    </div>
                  </div>
                  <span className="block h-1.5 overflow-hidden rounded-full bg-surface-container-highest">
                    <span
                      className="block h-full rounded-full bg-tertiary"
                      style={{ width: `${(p.promedio_mensual / max) * 100}%` }}
                    />
                  </span>
                </li>
                {isOpen && (
                  <ProductVendorBreakdown producto_ref={p.producto_ref} period={period} region={region} />
                )}
              </Fragment>
            );
          })}
        </ul>
      )}
    </section>
  );
}
