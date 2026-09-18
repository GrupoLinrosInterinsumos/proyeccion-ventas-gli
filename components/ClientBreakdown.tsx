"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatQty, formatUsd } from "@/lib/format";
import { saveClientProjectionAction, deleteClientProjectionAction } from "@/app/actions";
import SortButton, { nextSort, type SortDir } from "./SortButton";
import UnitTag from "./UnitTag";
import type { Unit } from "@/lib/units";

type ClientSortKey = "promedio" | "promedioUsd" | "proyeccion" | "total";

const SORT_VALUE: Record<ClientSortKey, (r: Row) => number> = {
  promedio: (r) => r.promedio_mensual,
  promedioUsd: (r) => r.promedio_usd,
  proyeccion: (r) => r.proyeccion ?? -1,
  total: (r) => r.total,
};

type Row = {
  partner: string;
  promedio_mensual: number;
  promedio_usd: number;
  proyeccion: number | null;
  precio: number | null;
  total: number;
  fijado_hasta: string | null;
  alert_acknowledged: boolean;
  is_manual: boolean;
};

export default function ClientBreakdown({
  vendedor,
  producto_ref,
  producto_nombre,
  period,
  editable,
  unit = "kg",
}: {
  vendedor: string;
  producto_ref: string;
  producto_nombre: string;
  period: string;
  editable: boolean;
  unit?: Unit;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addingClient, setAddingClient] = useState(false);
  const [sort, setSort] = useState<{ key: ClientSortKey; dir: SortDir } | null>(null);
  const router = useRouter();

  function load(showLoading = false) {
    if (showLoading) setRows(null);
    const params = new URLSearchParams({ vendedor, producto_ref, period });
    fetch(`/api/breakdown?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setRows(data.rows);
      })
      .catch(() => setError("No se pudo cargar."));
  }

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendedor, producto_ref, period]);

  // Reload the breakdown and refresh the page so the product-level total (auto-summed from
  // these rows) stays in sync after a client-level edit.
  function reload() {
    load();
    router.refresh();
  }

  const totals = useMemo(() => {
    if (!rows) return null;
    return rows.reduce(
      (acc, r) => ({
        promedio: acc.promedio + r.promedio_mensual,
        promedioUsd: acc.promedioUsd + r.promedio_usd,
        proyeccion: acc.proyeccion + (r.proyeccion ?? 0),
        total: acc.total + r.total,
      }),
      { promedio: 0, promedioUsd: 0, proyeccion: 0, total: 0 }
    );
  }, [rows]);

  const sortedRows = useMemo(() => {
    if (!rows || !sort) return rows;
    const value = SORT_VALUE[sort.key];
    const sign = sort.dir === "desc" ? -1 : 1;
    return [...rows].sort((a, b) => sign * (value(a) - value(b)));
  }, [rows, sort]);

  return (
    <div className="bg-surface-container-low px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-label-md uppercase tracking-wide text-on-surface-variant">
          Clientes &middot; últimos 3 meses cerrados
        </p>
        {editable && !addingClient && (
          <button
            onClick={() => setAddingClient(true)}
            className="rounded-md px-2 py-1 text-label-sm font-medium text-primary hover:bg-primary-fixed/40"
          >
            + Agregar cliente
          </button>
        )}
      </div>

      {error && <p className="text-body-sm text-secondary">{error}</p>}
      {!rows && !error && <p className="text-body-sm text-on-surface-variant">Cargando…</p>}

      {rows && (
        <div className="overflow-hidden rounded-md border border-outline-variant bg-surface-container-lowest">
          {rows.length === 0 && !addingClient ? (
            <p className="px-3 py-2 text-body-sm text-on-surface-variant">Sin ventas registradas en el periodo.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-low">
                  <th className="px-3 py-1.5 text-left text-label-sm uppercase tracking-wide text-on-surface-variant">
                    Cliente
                  </th>
                  <th className="px-3 py-1.5 text-right text-label-sm uppercase tracking-wide text-on-surface-variant">
                    <SortButton
                      label="Promedio"
                      active={sort?.key === "promedio"}
                      dir={sort?.dir ?? "desc"}
                      onClick={() => setSort((s) => nextSort(s, "promedio"))}
                    />
                  </th>
                  <th className="px-3 py-1.5 text-right text-label-sm uppercase tracking-wide text-on-surface-variant">
                    <SortButton
                      label="Prom. US$"
                      active={sort?.key === "promedioUsd"}
                      dir={sort?.dir ?? "desc"}
                      onClick={() => setSort((s) => nextSort(s, "promedioUsd"))}
                    />
                  </th>
                  <th className="px-3 py-1.5 text-left text-label-sm uppercase tracking-wide text-on-surface-variant">
                    <SortButton
                      label="Proyección"
                      active={sort?.key === "proyeccion"}
                      dir={sort?.dir ?? "desc"}
                      onClick={() => setSort((s) => nextSort(s, "proyeccion"))}
                    />
                  </th>
                  <th className="px-3 py-1.5 text-left text-label-sm uppercase tracking-wide text-on-surface-variant">
                    Precio
                  </th>
                  <th className="px-3 py-1.5 text-right text-label-sm uppercase tracking-wide text-on-surface-variant">
                    <SortButton
                      label="Total"
                      active={sort?.key === "total"}
                      dir={sort?.dir ?? "desc"}
                      onClick={() => setSort((s) => nextSort(s, "total"))}
                    />
                  </th>
                  <th className="px-3 py-1.5 text-left text-label-sm uppercase tracking-wide text-on-surface-variant">
                    Fijar
                  </th>
                </tr>
              </thead>
              <tbody>
                {(sortedRows ?? rows).map((r) => (
                  <ClientRow
                    key={r.partner}
                    row={r}
                    vendedor={vendedor}
                    producto_ref={producto_ref}
                    producto_nombre={producto_nombre}
                    period={period}
                    editable={editable}
                    unit={unit}
                    onSaved={reload}
                  />
                ))}
              </tbody>
              {totals && (
                <tfoot>
                  <tr className="border-t border-outline-variant bg-surface-container-low font-medium">
                    <td className="px-3 py-2 text-body-sm text-on-surface">Total producto</td>
                    <td className="px-3 py-2 text-right text-body-sm tabular-nums text-on-surface-variant">
                      {formatQty(totals.promedio)}
                      <UnitTag unit={unit} />
                    </td>
                    <td className="px-3 py-2 text-right text-body-sm tabular-nums text-on-surface-variant">
                      {formatUsd(totals.promedioUsd)}
                    </td>
                    <td className="px-3 py-2 text-body-sm tabular-nums text-on-surface">
                      {formatQty(totals.proyeccion)}
                      <UnitTag unit={unit} />
                    </td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2 text-right text-body-sm tabular-nums text-on-surface">
                      {formatUsd(totals.total)}
                    </td>
                    <td className="px-3 py-2" />
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      )}

      {addingClient && (
        <AddClientForm
          vendedor={vendedor}
          producto_ref={producto_ref}
          producto_nombre={producto_nombre}
          period={period}
          onDone={() => {
            setAddingClient(false);
            load();
            router.refresh();
          }}
          onCancel={() => setAddingClient(false)}
        />
      )}
    </div>
  );
}

function ClientRow({
  row,
  vendedor,
  producto_ref,
  producto_nombre,
  period,
  editable,
  unit,
  onSaved,
}: {
  row: Row;
  vendedor: string;
  producto_ref: string;
  producto_nombre: string;
  period: string;
  editable: boolean;
  unit: Unit;
  onSaved: () => void;
}) {
  const [proyeccion, setProyeccion] = useState(row.proyeccion?.toString() ?? "");
  const [precio, setPrecio] = useState(row.precio !== null ? row.precio.toFixed(2) : "");
  const [fijadoHasta, setFijadoHasta] = useState(row.fijado_hasta ?? "");
  const [showDate, setShowDate] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const proyeccionNum = proyeccion.trim() === "" ? null : Number(proyeccion);
  const precioNum = precio.trim() === "" ? null : Number(precio);
  const total = proyeccionNum != null && precioNum != null ? proyeccionNum * precioNum : 0;

  const delta =
    proyeccionNum !== null && row.promedio_mensual > 0
      ? (proyeccionNum - row.promedio_mensual) / row.promedio_mensual
      : null;
  const overThreshold = delta !== null && delta >= 1;

  function persist(next: { proyeccion?: string; precio?: string; fijado_hasta?: string | null }) {
    const fd = new FormData();
    fd.set("period", period);
    fd.set("vendedor", vendedor);
    fd.set("producto_ref", producto_ref);
    fd.set("producto_nombre", producto_nombre);
    fd.set("partner", row.partner);
    fd.set("proyeccion", next.proyeccion ?? proyeccion);
    fd.set("precio", next.precio ?? precio);
    const fh = next.fijado_hasta !== undefined ? next.fijado_hasta : fijadoHasta;
    if (fh) fd.set("fijado_hasta", fh);

    setStatus("saving");
    startTransition(async () => {
      const res = await saveClientProjectionAction(fd);
      setStatus(res?.error ? "error" : "saved");
      if (!res?.error) {
        onSaved();
        setTimeout(() => setStatus("idle"), 1200);
      }
    });
  }

  function deleteClient() {
    if (!confirm(`¿Eliminar a ${row.partner} de este producto?`)) return;
    const fd = new FormData();
    fd.set("period", period);
    fd.set("vendedor", vendedor);
    fd.set("producto_ref", producto_ref);
    fd.set("producto_nombre", producto_nombre);
    fd.set("partner", row.partner);
    setDeleteError(null);
    startTransition(async () => {
      const res = await deleteClientProjectionAction(fd);
      if (res?.error) setDeleteError(res.error);
      else onSaved();
    });
  }

  return (
    <>
      <tr className="border-b border-outline-variant last:border-b-0">
        <td className="px-3 py-1.5 text-body-sm text-on-surface">
          {row.partner}
          {row.is_manual && (
            <span className="ml-1.5 rounded bg-tertiary-fixed px-1 py-0.5 text-label-sm text-on-tertiary-fixed-variant">
              nuevo
            </span>
          )}
          {fijadoHasta && (
            <span className="ml-1.5 rounded bg-primary-fixed px-1 py-0.5 text-label-sm text-on-primary-fixed-variant">
              fijado hasta {fijadoHasta}
            </span>
          )}
          {editable && row.is_manual && (
            <button
              onClick={deleteClient}
              disabled={pending}
              className="ml-1.5 text-label-sm text-secondary hover:underline disabled:opacity-50"
            >
              Eliminar
            </button>
          )}
          {deleteError && <p className="text-label-sm text-secondary">{deleteError}</p>}
        </td>
        <td className="px-3 py-1.5 text-right text-body-sm tabular-nums text-on-surface-variant">
          {formatQty(row.promedio_mensual)}
          <UnitTag unit={unit} />
        </td>
        <td className="px-3 py-1.5 text-right text-body-sm tabular-nums text-on-surface-variant">
          {row.promedio_usd > 0 ? formatUsd(row.promedio_usd) : "—"}
        </td>
        <td className="px-3 py-1.5">
          <div className="flex items-center gap-1.5">
            {editable ? (
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
                className="w-20 rounded-md border border-outline-variant bg-surface-container-lowest px-2 py-1 text-body-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            ) : (
              <span className="text-body-sm tabular-nums text-on-surface">
                {formatQty(proyeccionNum)}
                {proyeccionNum !== null && <UnitTag unit={unit} />}
              </span>
            )}
            {editable && <UnitTag unit={unit} />}
            {delta !== null && (
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-label-sm font-medium ${
                  overThreshold
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
        </td>
        <td className="px-3 py-1.5">
          {editable ? (
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              onBlur={() => {
                const rounded = precio.trim() === "" ? "" : (Math.round(Number(precio) * 100) / 100).toFixed(2);
                setPrecio(rounded);
                persist({ precio: rounded });
              }}
              placeholder="US$"
              className="w-20 rounded-md border border-outline-variant bg-surface-container-lowest px-2 py-1 text-body-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          ) : (
            <span className="text-body-sm tabular-nums text-on-surface">
              {precioNum != null ? formatUsd(precioNum) : "—"}
            </span>
          )}
        </td>
        <td className="px-3 py-1.5 text-right text-body-sm font-medium tabular-nums text-on-surface">
          {formatUsd(total)}
        </td>
        <td className="px-3 py-1.5">
          {editable ? (
            showDate ? (
              <input
                type="date"
                value={fijadoHasta}
                autoFocus
                onChange={(e) => setFijadoHasta(e.target.value)}
                onBlur={() => {
                  setShowDate(false);
                  persist({ fijado_hasta: fijadoHasta || null });
                }}
                className="w-32 rounded-md border border-outline-variant bg-surface-container-lowest px-2 py-1 text-body-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            ) : (
              <button
                onClick={() => setShowDate(true)}
                className="rounded-md border border-outline-variant px-2 py-1 text-label-sm text-on-surface-variant hover:bg-surface-container-high"
              >
                {fijadoHasta ? "Editar" : "Fijar"}
              </button>
            )
          ) : (
            <span className="text-label-sm text-on-surface-variant">{fijadoHasta || "—"}</span>
          )}
          <span
            className={`ml-2 inline-block h-1.5 w-1.5 rounded-full transition-opacity ${
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
      </tr>
      {overThreshold && (
        <tr className="border-b border-outline-variant last:border-b-0 bg-error-container">
          <td colSpan={7} className="px-3 py-2">
            <p className="text-body-sm text-on-error-container">
              <strong>{row.partner}</strong> supera el 100% de su promedio ({formatQty(row.promedio_mensual)} →{" "}
              {formatQty(proyeccionNum)}).
            </p>
          </td>
        </tr>
      )}
    </>
  );
}

function AddClientForm({
  vendedor,
  producto_ref,
  producto_nombre,
  period,
  onDone,
  onCancel,
}: {
  vendedor: string;
  producto_ref: string;
  producto_nombre: string;
  period: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [partner, setPartner] = useState("");
  const [proyeccion, setProyeccion] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!partner.trim()) {
      setError("Escribe el nombre del cliente.");
      return;
    }
    const fd = new FormData();
    fd.set("period", period);
    fd.set("vendedor", vendedor);
    fd.set("producto_ref", producto_ref);
    fd.set("producto_nombre", producto_nombre);
    fd.set("partner", partner.trim());
    fd.set("proyeccion", proyeccion);
    fd.set("precio", "");
    startTransition(async () => {
      const res = await saveClientProjectionAction(fd);
      if (res?.error) setError(res.error);
      else onDone();
    });
  }

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2 rounded-md border border-dashed border-outline-variant bg-surface-container-lowest p-3">
      <div className="flex flex-col gap-1">
        <label className="text-label-sm text-on-surface-variant">Cliente</label>
        <input
          value={partner}
          onChange={(e) => setPartner(e.target.value)}
          placeholder="Nombre del cliente"
          className="w-56 rounded-md border border-outline-variant bg-surface-container-low px-2 py-1.5 text-body-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-label-sm text-on-surface-variant">Proyección</label>
        <input
          type="number"
          inputMode="decimal"
          value={proyeccion}
          onChange={(e) => setProyeccion(e.target.value)}
          placeholder="0"
          className="w-24 rounded-md border border-outline-variant bg-surface-container-low px-2 py-1.5 text-body-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>
      <button
        onClick={submit}
        disabled={pending}
        className="h-touch rounded-md bg-primary px-4 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Guardando…" : "Guardar"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="h-touch rounded-md px-3 text-body-sm text-on-surface-variant hover:bg-surface-container-high"
      >
        Cancelar
      </button>
      {error && <p className="w-full text-body-sm text-secondary">{error}</p>}
    </div>
  );
}
