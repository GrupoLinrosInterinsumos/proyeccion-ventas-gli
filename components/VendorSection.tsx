"use client";

import { Fragment, useMemo, useState } from "react";
import { formatQty, initials } from "@/lib/format";
import type { ProductRow } from "@/lib/sales";
import EditableProjectionCells from "./EditableProjectionCells";
import ClientBreakdown from "./ClientBreakdown";
import AddProductForm from "./AddProductForm";

export default function VendorSection({
  period,
  vendedor,
  rows,
  defaultOpen = true,
  editable = true,
  searchable = false,
}: {
  period: string;
  vendedor: string;
  rows: ProductRow[];
  defaultOpen?: boolean;
  editable?: boolean;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const totals = useMemo(
    () => ({
      promedio: rows.reduce((s, r) => s + r.promedio_mensual, 0),
      proyeccion: rows.reduce((s, r) => s + (r.proyeccion ?? 0), 0),
      pendientes: rows.filter((r) => r.proyeccion === null).length,
    }),
    [rows]
  );

  const visibleRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) => r.producto_nombre.toLowerCase().includes(q) || r.producto_ref.toLowerCase().includes(q)
    );
  }, [rows, search]);

  return (
    <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm shadow-black/[0.04]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left hover:bg-surface-container-low"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary-container text-label-md">
            {initials(vendedor)}
          </span>
          <div>
            <h3 className="text-body-lg font-semibold text-on-surface">{vendedor}</h3>
            <p className="text-label-sm text-on-surface-variant">
              {rows.length} producto{rows.length === 1 ? "" : "s"}
              {totals.pendientes > 0 && (
                <span className="ml-2 rounded bg-secondary-fixed px-1.5 py-0.5 text-on-secondary-fixed-variant">
                  {totals.pendientes} sin proyección
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-label-sm uppercase tracking-wide text-on-surface-variant">Promedio</p>
            <p className="text-body-md font-semibold tabular-nums text-on-surface">
              {formatQty(totals.promedio)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-label-sm uppercase tracking-wide text-on-surface-variant">Proyección</p>
            <p className="text-body-md font-semibold tabular-nums text-primary">
              {formatQty(totals.proyeccion)}
            </p>
          </div>
          <span
            className={`text-on-surface-variant transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          >
            ▾
          </span>
        </div>
      </button>

      {open && (
        <div className="border-t border-outline-variant">
          {(editable || searchable) && (
            <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant bg-surface-container-low px-4 py-2.5">
              {editable && <AddProductForm vendedor={vendedor} />}
              {searchable && (
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar producto…"
                  className="ml-auto w-56 rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-body-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              )}
            </div>
          )}
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-low">
                  <th className="px-3 py-2 text-left text-label-md uppercase tracking-wide text-on-surface-variant">
                    Producto
                  </th>
                  <th className="px-3 py-2 text-right text-label-md uppercase tracking-wide text-on-surface-variant">
                    Prom. mensual (3m)
                  </th>
                  <th className="px-3 py-2 text-left text-label-md uppercase tracking-wide text-on-surface-variant">
                    Proyección
                  </th>
                  <th className="px-3 py-2 text-left text-label-md uppercase tracking-wide text-on-surface-variant">
                    Observaciones
                  </th>
                  <th className="w-8 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const key = row.producto_ref;
                  const isOpen = expanded === key;
                  return (
                    <Fragment key={key}>
                      <tr className="cursor-pointer border-b border-outline-variant last:border-b-0 hover:bg-surface-container-low">
                        <td className="px-3 py-2" onClick={() => setExpanded(isOpen ? null : key)}>
                          <div className="flex items-start gap-2">
                            <span
                              className={`mt-0.5 shrink-0 text-on-surface-variant transition-transform ${isOpen ? "rotate-90" : ""}`}
                              aria-hidden
                            >
                              ›
                            </span>
                            <div>
                              <p className="text-body-sm font-medium text-on-surface">
                                {row.producto_nombre}
                              </p>
                              <p className="text-label-sm text-on-surface-variant">
                                {row.producto_ref}
                                {row.is_manual && (
                                  <span className="ml-1.5 rounded bg-tertiary-fixed px-1 py-0.5 text-on-tertiary-fixed-variant">
                                    manual
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td
                          className="px-3 py-2 text-right text-body-sm tabular-nums text-on-surface"
                          onClick={() => setExpanded(isOpen ? null : key)}
                        >
                          {formatQty(row.promedio_mensual)}
                        </td>
                        {editable ? (
                          <EditableProjectionCells
                            period={period}
                            vendedor={vendedor}
                            producto_ref={row.producto_ref}
                            producto_nombre={row.producto_nombre}
                            initialProyeccion={row.proyeccion}
                            initialObservaciones={row.observaciones}
                            promedio={row.promedio_mensual}
                          />
                        ) : (
                          <>
                            <td className="px-3 py-2 text-body-sm tabular-nums text-on-surface">
                              {row.proyeccion !== null ? formatQty(row.proyeccion) : "—"}
                            </td>
                            <td className="px-3 py-2 text-body-sm text-on-surface-variant">
                              {row.observaciones || "—"}
                            </td>
                            <td className="w-8 px-2 py-2" />
                          </>
                        )}
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-outline-variant last:border-b-0">
                          <td colSpan={5} className="p-0">
                            <ClientBreakdown
                              vendedor={vendedor}
                              producto_ref={row.producto_ref}
                              producto_nombre={row.producto_nombre}
                              period={period}
                              editable={editable}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
