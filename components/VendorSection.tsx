"use client";

import { Fragment, useEffect, useMemo, useState, useTransition, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { formatQty, formatQtySplit, formatUsd, initials } from "@/lib/format";
import type { CatalogProduct, ProductRow, ProductStatus } from "@/lib/sales";
import { deleteProductAction, setProductStatusAction } from "@/app/actions";
import { trackSave } from "@/lib/save-tracker";
import EditableProjectionCells from "./EditableProjectionCells";
import ClientBreakdown from "./ClientBreakdown";
import AddProductForm from "./AddProductForm";
import SortButton, { nextSort, type SortDir } from "./SortButton";
import UnitTag from "./UnitTag";
import MonthlySparkline from "./MonthlySparkline";
import SaveAllButton from "./SaveAllButton";
import { addQty, emptyQty, unitForCategoria } from "@/lib/units";
import { closedMonthsForPeriod } from "@/lib/period";

// Months shown in the peak-sales chart — keep in sync with SERIES_MONTHS in lib/sales.ts (that
// module is server-only, so it can't be imported here).
const CHART_MONTHS = 3;

type ProductSortKey = "promedio" | "proyeccion" | "ingreso";

type StatusFilter = "" | "sin_abrir" | ProductStatus;

const STATUS_LABEL: Record<ProductStatus, string> = { en_proceso: "En proceso", terminado: "Terminado" };

/** Row background by the state the vendedor set; a product never opened stays uncolored. */
function rowTone(estado: ProductStatus | null): string {
  if (estado === "terminado") return "bg-edited hover:bg-edited-hover";
  if (estado === "en_proceso") return "bg-progress hover:bg-progress-hover";
  return "hover:bg-surface-container-low";
}

const SORT_VALUE: Record<ProductSortKey, (r: ProductRow) => number> = {
  promedio: (r) => r.promedio_mensual,
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
  catalog = [],
}: {
  period: string;
  vendedor: string;
  rows: ProductRow[];
  defaultOpen?: boolean;
  editable?: boolean;
  searchable?: boolean;
  catalog?: CatalogProduct[];
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoriaN2, setCategoriaN2] = useState("");
  const [sort, setSort] = useState<{ key: ProductSortKey; dir: SortDir } | null>(null);
  const [estadoFiltro, setEstadoFiltro] = useState<StatusFilter>("");
  // The vendedor's own "en proceso" / "terminado" marks, updated at once and saved in the background.
  const [statuses, setStatuses] = useState<Record<string, ProductStatus | null>>(() =>
    Object.fromEntries(rows.map((r) => [r.producto_ref, r.estado_usuario]))
  );
  useEffect(() => {
    setStatuses(Object.fromEntries(rows.map((r) => [r.producto_ref, r.estado_usuario])));
  }, [rows]);

  function changeStatus(producto_ref: string, estado: ProductStatus | null) {
    setStatuses((s) => ({ ...s, [producto_ref]: estado }));
    const fd = new FormData();
    fd.set("period", period);
    fd.set("vendedor", vendedor);
    fd.set("producto_ref", producto_ref);
    fd.set("estado", estado ?? "sin_abrir");
    void trackSave(setProductStatusAction(fd));
  }

  // Opening a product for the first time marks it "en proceso"; the vendedor moves it to "terminado".
  function toggleExpanded(producto_ref: string, isOpen: boolean) {
    setExpanded(isOpen ? null : producto_ref);
    if (!isOpen && editable && !statuses[producto_ref]) changeStatus(producto_ref, "en_proceso");
  }

  const hasStatuses = useMemo(() => Object.values(statuses).some(Boolean), [statuses]);

  // Kilograms and units are never added together: totals keep them apart.
  const totals = useMemo(() => {
    const promedio = emptyQty();
    const proyeccion = emptyQty();
    for (const r of rows) {
      const unit = unitForCategoria(r.categoria_n2);
      addQty(promedio, unit, r.promedio_mensual);
      addQty(proyeccion, unit, r.proyeccion ?? 0);
    }
    return {
      promedio,
      proyeccion,
      ingreso: rows.reduce((s, r) => s + r.ingreso_proyectado, 0),
      pendientes: rows.filter((r) => r.proyeccion === null).length,
    };
  }, [rows]);

  const chartMonths = useMemo(() => closedMonthsForPeriod(period, CHART_MONTHS), [period]);

  const categoriaOptions = useMemo(
    () => [...new Set(rows.map((r) => r.categoria_n2).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "es")),
    [rows]
  );

  const filtered = categoriaN2 !== "" || search.trim() !== "" || estadoFiltro !== "";

  const visibleRows = useMemo(() => {
    let list = rows;
    if (categoriaN2) list = list.filter((r) => r.categoria_n2 === categoriaN2);
    if (estadoFiltro === "sin_abrir") list = list.filter((r) => !statuses[r.producto_ref]);
    else if (estadoFiltro) list = list.filter((r) => statuses[r.producto_ref] === estadoFiltro);
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
  }, [rows, search, categoriaN2, estadoFiltro, statuses, sort]);

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
              {formatQtySplit(totals.promedio)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-label-sm uppercase tracking-wide text-on-surface-variant">Proyección</p>
            <p className="text-body-md font-semibold tabular-nums text-primary">
              {formatQtySplit(totals.proyeccion)}
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
          {(editable || searchable || categoriaOptions.length > 1 || hasStatuses) && (
            <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant bg-surface-container-low px-4 py-2.5">
              {editable && <AddProductForm vendedor={vendedor} catalog={catalog} />}
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {(editable || hasStatuses) && (
                  <>
                    <span className="flex items-center gap-1.5 text-label-sm text-on-surface-variant" title="Productos que marcaste como en proceso">
                      <span className="inline-block h-3 w-3 rounded-sm border border-[#f1d58a] bg-progress" aria-hidden />
                      En proceso
                    </span>
                    <span className="flex items-center gap-1.5 text-label-sm text-on-surface-variant" title="Productos que marcaste como terminados">
                      <span className="inline-block h-3 w-3 rounded-sm border border-[#b9dfc1] bg-edited" aria-hidden />
                      Terminado
                    </span>
                    <select
                      value={estadoFiltro}
                      onChange={(e) => setEstadoFiltro(e.target.value as StatusFilter)}
                      aria-label="Filtrar por estado"
                      className="rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-body-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="">Todos los estados</option>
                      <option value="sin_abrir">Sin abrir</option>
                      <option value="en_proceso">En proceso</option>
                      <option value="terminado">Terminado</option>
                    </select>
                  </>
                )}
                {categoriaOptions.length > 1 && (
                  <select
                    value={categoriaN2}
                    onChange={(e) => setCategoriaN2(e.target.value)}
                    className="rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-body-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
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
                    className="w-56 rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-body-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                )}
                {editable && <SaveAllButton />}
              </div>
            </div>
          )}
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full min-w-[760px] table-fixed border-collapse">
              <colgroup>
                <col />
                <col className="w-[124px]" />
                <col className="w-[112px]" />
                <col className="w-[96px]" />
                <col className="w-[168px]" />
                <col className="w-[170px]" />
                <col className="w-[28px]" />
              </colgroup>
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-low">
                  <th className="px-3 py-2 text-left text-label-md uppercase tracking-wide text-on-surface-variant">
                    Producto
                    <span
                      className="ml-2 rounded bg-surface-container-high px-1.5 py-0.5 text-label-sm normal-case tracking-normal text-on-surface-variant"
                      title={filtered ? "Productos que cumplen el filtro, del total" : "Total de productos"}
                    >
                      {filtered ? `${visibleRows.length} de ${rows.length}` : rows.length}
                    </span>
                  </th>
                  <th className="px-3 py-2 text-left text-label-md uppercase tracking-wide text-on-surface-variant">
                    Estado
                  </th>
                  <th className="px-3 py-2 text-right text-label-md uppercase tracking-wide text-on-surface-variant">
                    <SortButton
                      label="Prom. mensual (3m)"
                      active={sort?.key === "promedio"}
                      dir={sort?.dir ?? "desc"}
                      onClick={() => setSort((s) => nextSort(s, "promedio"))}
                    />
                  </th>
                  <th
                    className="px-3 py-2 text-left text-label-md uppercase tracking-wide text-on-surface-variant"
                    title="Ventas de cada uno de los 3 meses del promedio. Barra roja: el mes pico."
                  >
                    Ventas 3m
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
                  const estado = statuses[key] ?? null;
                  return (
                    <Fragment key={key}>
                      <tr className={`cursor-pointer border-b border-outline-variant last:border-b-0 ${rowTone(estado)}`}>
                        <td className="px-3 py-2" onClick={() => toggleExpanded(key, isOpen)}>
                          <div className="flex items-start gap-2">
                            <span
                              className={`mt-0.5 shrink-0 text-on-surface-variant transition-transform ${isOpen ? "rotate-90" : ""}`}
                              aria-hidden
                            >
                              ›
                            </span>
                            <div className="min-w-0">
                              <p className="break-words text-body-sm font-medium text-on-surface">
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
                        <td className="px-3 py-2">
                          {editable ? (
                            <StatusSelect value={estado} onChange={(e) => changeStatus(key, e)} />
                          ) : estado ? (
                            <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-label-sm font-medium text-on-surface-variant">
                              {STATUS_LABEL[estado]}
                            </span>
                          ) : null}
                        </td>
                        <td
                          className="px-3 py-2 text-right text-body-sm tabular-nums text-on-surface"
                          onClick={() => toggleExpanded(key, isOpen)}
                        >
                          {formatQty(row.promedio_mensual)}
                          <UnitTag unit={unitForCategoria(row.categoria_n2)} />
                        </td>
                        <td className="px-3 py-2" onClick={() => toggleExpanded(key, isOpen)}>
                          <MonthlySparkline
                            values={row.serie}
                            months={chartMonths}
                            unit={unitForCategoria(row.categoria_n2)}
                          />
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
                            <td className="break-words px-3 py-2 text-body-sm text-on-surface-variant">
                              {row.observaciones || "—"}
                            </td>
                            <td className="w-8 px-2 py-2" />
                          </>
                        )}
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-outline-variant last:border-b-0">
                          <td colSpan={7} className="p-0">
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

/** The vendedor's own mark on a product: not opened (no color), in process (amber) or finished (green). */
function StatusSelect({
  value,
  onChange,
}: {
  value: ProductStatus | null;
  onChange: (estado: ProductStatus | null) => void;
}) {
  const tone =
    value === "terminado"
      ? "border-[#b9dfc1] bg-edited text-[#1b5e2f]"
      : value === "en_proceso"
        ? "border-[#f1d58a] bg-progress text-[#7a4b00]"
        : "border-outline-variant bg-surface-container-lowest text-on-surface-variant";
  return (
    <select
      value={value ?? "sin_abrir"}
      onChange={(e) => onChange(e.target.value === "sin_abrir" ? null : (e.target.value as ProductStatus))}
      onClick={(e) => e.stopPropagation()}
      aria-label="Estado del producto"
      className={`w-full rounded-md border px-2 py-1 text-label-sm font-medium outline-none focus:ring-2 focus:ring-primary/20 ${tone}`}
    >
      <option value="sin_abrir">Sin abrir</option>
      <option value="en_proceso">En proceso</option>
      <option value="terminado">Terminado</option>
    </select>
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
