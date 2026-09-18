"use client";

import { Fragment, useMemo, useState, useTransition, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { formatQty, formatUsd, initials } from "@/lib/format";
import type { ProductRow } from "@/lib/sales";
import { deleteProductAction } from "@/app/actions";
import EditableProjectionCells from "./EditableProjectionCells";
import ClientBreakdown from "./ClientBreakdown";
import AddProductForm from "./AddProductForm";
import SortButton, { nextSort, type SortDir } from "./SortButton";
import UnitTag from "./UnitTag";
import { unitForCategoria } from "@/lib/units";

type ProductSortKey = "promedio" | "promedioUsd" | "proyeccion" | "ingreso";

const SORT_VALUE: Record<ProductSortKey, (r: ProductRow) => number> = {
  promedio: (r) => r.promedio_mensual,
  promedioUsd: (r) => r.promedio_usd,
  proyeccion: (r) => r.proyeccion ?? -1,
  ingreso: (r) => r.ingreso_proyectado,
};

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
  const [categoriaN2, setCategoriaN2] = useState("");
  const [sort, setSort] = useState<{ key: ProductSortKey; dir: SortDir } | null>(null);

  const totals = useMemo(
    () => ({
      promedio: rows.reduce((s, r) => s + r.promedio_mensual, 0),
      proyeccion: rows.reduce((s, r) => s + (r.proyeccion ?? 0), 0),
      ingreso: rows.reduce((s, r) => s + r.ingreso_proyectado, 0),
      pendientes: rows.filter((r) => r.proyeccion === null).length,
    }),
    [rows]
  );

  const categoriaOptions = useMemo(
    () => [...new Set(rows.map((r) => r.categoria_n2).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "es")),
    [rows]
  );

  const visibleRows = useMemo(() => {
    let list = rows;
    if (categoriaN2) list = list.filter((r) => r.categoria_n2 === categoriaN2);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) => r.producto_nombre.toLowerCase().includes(q) || r.producto_ref.toLowerCase().includes(q)
      );
    }
    if (sort) {
      const value = SORT_VALUE[sort.key];
      const sign = sort.dir === "desc" ? -1 : 1;
      list = [...list].sort((a, b) => sign * (value(a) - value(b)));
    }
    return list;
  }, [rows, search, categoriaN2, sort]);

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
          <div className="text-right">
            <p className="text-label-sm uppercase tracking-wide text-on-surface-variant">Proyección (USD)</p>
            <p className="text-body-md font-semibold tabular-nums text-primary">
              {formatUsd(totals.ingreso)}
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
          {(editable || searchable || categoriaOptions.length > 1) && (
            <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant bg-surface-container-low px-4 py-2.5">
              {editable && <AddProductForm vendedor={vendedor} />}
              {categoriaOptions.length > 1 && (
                <select
                  value={categoriaN2}
                  onChange={(e) => setCategoriaN2(e.target.value)}
                  className="ml-auto rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-body-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Todas las categorías</option>
                  {categoriaOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}
              {searchable && (
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar producto…"
                  className={`w-56 rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-body-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 ${
                    categoriaOptions.length > 1 ? "" : "ml-auto"
                  }`}
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
                    <SortButton
                      label="Prom. mensual (3m)"
                      active={sort?.key === "promedio"}
                      dir={sort?.dir ?? "desc"}
                      onClick={() => setSort((s) => nextSort(s, "promedio"))}
                    />
                  </th>
                  <th className="px-3 py-2 text-right text-label-md uppercase tracking-wide text-on-surface-variant">
                    <SortButton
                      label="Prom. US$ (3m)"
                      active={sort?.key === "promedioUsd"}
                      dir={sort?.dir ?? "desc"}
                      onClick={() => setSort((s) => nextSort(s, "promedioUsd"))}
                    />
                  </th>
                  <th className="px-3 py-2 text-left text-label-md uppercase tracking-wide text-on-surface-variant">
                    <div className="flex items-center gap-3">
                      <SortButton
                        label="Proyección"
                        active={sort?.key === "proyeccion"}
                        dir={sort?.dir ?? "desc"}
                        onClick={() => setSort((s) => nextSort(s, "proyeccion"))}
                      />
                      <SortButton
                        label="US$"
                        active={sort?.key === "ingreso"}
                        dir={sort?.dir ?? "desc"}
                        onClick={() => setSort((s) => nextSort(s, "ingreso"))}
                      />
                    </div>
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
                                {editable && row.is_manual && (
                                  <DeleteProductButton
                                    period={period}
                                    vendedor={vendedor}
                                    producto_ref={row.producto_ref}
                                  />
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
                          <UnitTag unit={unitForCategoria(row.categoria_n2)} />
                        </td>
                        <td
                          className="px-3 py-2 text-right text-body-sm tabular-nums text-on-surface-variant"
                          onClick={() => setExpanded(isOpen ? null : key)}
                        >
                          {row.promedio_usd > 0 ? formatUsd(row.promedio_usd) : "—"}
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
                            ingresoProyectado={row.ingreso_proyectado}
                            unit={unitForCategoria(row.categoria_n2)}
                          />
                        ) : (
                          <>
                            <td className="px-3 py-2 text-body-sm tabular-nums text-on-surface">
                              <div className="flex items-center gap-1.5">
                                <span>
                                  {row.proyeccion !== null ? formatQty(row.proyeccion) : "—"}
                                  {row.proyeccion !== null && <UnitTag unit={unitForCategoria(row.categoria_n2)} />}
                                </span>
                                {row.proyeccion !== null && row.promedio_mensual > 0 && (() => {
                                  const delta = (row.proyeccion - row.promedio_mensual) / row.promedio_mensual;
                                  return (
                                    <span
                                      className={`shrink-0 rounded px-1.5 py-0.5 text-label-sm font-medium ${
                                        delta >= 1
                                          ? "bg-error-container text-on-error-container"
                                          : delta >= 0
                                            ? "bg-tertiary-fixed text-on-tertiary-fixed-variant"
                                            : "bg-secondary-fixed text-on-secondary-fixed-variant"
                                      }`}
                                    >
                                      {delta >= 0 ? "+" : ""}
                                      {Math.round(delta * 100)}%
                                    </span>
                                  );
                                })()}
                              </div>
                              {row.ingreso_proyectado > 0 && (
                                <p className="text-label-sm font-normal text-on-surface-variant">
                                  {formatUsd(row.ingreso_proyectado)}
                                </p>
                              )}
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
                          <td colSpan={6} className="p-0">
                            <ClientBreakdown
                              vendedor={vendedor}
                              producto_ref={row.producto_ref}
                              producto_nombre={row.producto_nombre}
                              period={period}
                              editable={editable}
                              unit={unitForCategoria(row.categoria_n2)}
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

function DeleteProductButton({
  period,
  vendedor,
  producto_ref,
}: {
  period: string;
  vendedor: string;
  producto_ref: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete(e: MouseEvent) {
    e.stopPropagation();
    if (!confirm("¿Eliminar este producto agregado manualmente?")) return;
    const fd = new FormData();
    fd.set("period", period);
    fd.set("vendedor", vendedor);
    fd.set("producto_ref", producto_ref);
    setError(null);
    startTransition(async () => {
      const res = await deleteProductAction(fd);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <>
      <button
        onClick={handleDelete}
        disabled={pending}
        className="ml-1.5 text-label-sm text-secondary hover:underline disabled:opacity-50"
      >
        Eliminar
      </button>
      {error && <span className="ml-1.5 text-label-sm text-secondary">{error}</span>}
    </>
  );
}
