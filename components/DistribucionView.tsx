"use client";

import { Fragment, useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveDistribucionAction,
  updateDistribucionAction,
  deleteDistribucionAction,
  type ActionState,
} from "@/app/actions";
import { formatQty } from "@/lib/format";
import { periodLabel } from "@/lib/period";
import type { Distribucion } from "@/lib/distribucion";
import type { CatalogProduct } from "@/lib/sales";
import UnitTag from "./UnitTag";

type Mes = { value: string; label: string };
type Estado = "Vigente" | "Último mes" | "Vencida";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function estadoDe(hasta: string, mesActual: string): Estado {
  return hasta > mesActual ? "Vigente" : hasta === mesActual ? "Último mes" : "Vencida";
}

const TAG: Record<Estado, string> = {
  Vigente: "bg-edited text-[#1b5e2f]",
  "Último mes": "bg-progress text-[#7a4b00]",
  Vencida: "bg-surface-container-high text-on-surface-variant",
};

const inputClass =
  "rounded-md border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-body-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

export default function DistribucionView({
  rows,
  isAdmin,
  mesActual,
  meses,
  catalog,
}: {
  rows: Distribucion[];
  isAdmin: boolean;
  mesActual: string;
  meses: Mes[];
  catalog: CatalogProduct[];
}) {
  const [search, setSearch] = useState("");
  const [verVencidas, setVerVencidas] = useState(false);
  const [adding, setAdding] = useState(false);

  const term = norm(search.trim());
  const vencidas = rows.filter((r) => estadoDe(r.hasta_mes, mesActual) === "Vencida").length;

  const grupos = useMemo(() => {
    const map = new Map<string, { ref: string; nombre: string; unidad: Distribucion["unidad"]; items: Distribucion[] }>();
    for (const r of rows) {
      if (!verVencidas && estadoDe(r.hasta_mes, mesActual) === "Vencida") continue;
      if (term && !(norm(r.producto_nombre).includes(term) || norm(r.producto_ref).includes(term) || norm(r.partner).includes(term))) continue;
      const g = map.get(r.producto_ref) ?? { ref: r.producto_ref, nombre: r.producto_nombre, unidad: r.unidad, items: [] };
      g.items.push(r);
      map.set(r.producto_ref, g);
    }
    const total = (items: Distribucion[]) =>
      items.filter((i) => estadoDe(i.hasta_mes, mesActual) !== "Vencida").reduce((s, i) => s + i.cantidad, 0);
    return [...map.values()]
      .map((g) => ({ ...g, items: [...g.items].sort((a, b) => b.cantidad - a.cantidad), total: total(g.items) }))
      .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, "es"));
  }, [rows, term, verVencidas, mesActual]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {isAdmin && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-body-sm font-medium text-on-primary hover:opacity-90"
          >
            <span aria-hidden>+</span> Agregar distribución
          </button>
        )}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar producto, código o cliente…"
          className={`w-72 py-2 ${inputClass}`}
        />
        {vencidas > 0 && (
          <label className="flex cursor-pointer items-center gap-2 text-body-sm text-on-surface-variant">
            <input type="checkbox" checked={verVencidas} onChange={(e) => setVerVencidas(e.target.checked)} />
            Mostrar vencidas ({vencidas})
          </label>
        )}
      </div>

      {isAdmin && adding && (
        <AddDistribucion meses={meses} catalog={catalog} onClose={() => setAdding(false)} />
      )}

      {grupos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-10 text-center text-body-md text-on-surface-variant">
          {rows.length === 0
            ? isAdmin
              ? "Todavía no hay distribuciones. Agrega la primera con «Agregar distribución»."
              : "Todavía no hay productos en distribución."
            : "Ninguna distribución coincide con la búsqueda."}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {grupos.map((g) => (
            <section
              key={g.ref}
              className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm shadow-black/[0.04]"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <h3 className="break-words text-body-lg font-semibold text-on-surface">{g.nombre}</h3>
                  <p className="text-label-sm text-on-surface-variant">{g.ref}</p>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-label-sm uppercase tracking-wide text-on-surface-variant">Clientes</p>
                    <p className="text-body-md font-semibold tabular-nums text-on-surface">{g.items.length}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-label-sm uppercase tracking-wide text-on-surface-variant">Distribuyendo</p>
                    <p className="text-body-md font-semibold tabular-nums text-primary">
                      {formatQty(g.total)}
                      <UnitTag unit={g.unidad} />
                    </p>
                  </div>
                </div>
              </div>
              <div className="thin-scroll overflow-x-auto border-t border-outline-variant">
                <table className="w-full min-w-[560px] border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low">
                      <th className="px-3 py-2 text-left text-label-md uppercase tracking-wide text-on-surface-variant">Cliente</th>
                      <th className="px-3 py-2 text-right text-label-md uppercase tracking-wide text-on-surface-variant">Cantidad</th>
                      <th className="px-3 py-2 text-left text-label-md uppercase tracking-wide text-on-surface-variant">Hasta</th>
                      <th className="px-3 py-2 text-left text-label-md uppercase tracking-wide text-on-surface-variant">Estado</th>
                      {isAdmin && <th className="w-40 px-3 py-2" />}
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((r) => (
                      <Fila key={r.id} r={r} isAdmin={isAdmin} mesActual={mesActual} meses={meses} />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Fila({ r, isAdmin, mesActual, meses }: { r: Distribucion; isAdmin: boolean; mesActual: string; meses: Mes[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [cantidad, setCantidad] = useState(String(r.cantidad));
  const [hasta, setHasta] = useState(r.hasta_mes);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const estado = estadoDe(r.hasta_mes, mesActual);
  // A distribution that already ended is not in the "from this month on" list: keep its month selectable.
  const opciones = meses.some((m) => m.value === r.hasta_mes) ? meses : [{ value: r.hasta_mes, label: periodLabel(r.hasta_mes) }, ...meses];

  function guardar() {
    const fd = new FormData();
    fd.set("id", String(r.id));
    fd.set("cantidad", cantidad);
    fd.set("hasta_mes", hasta);
    setError(null);
    startTransition(async () => {
      const res = await updateDistribucionAction(fd);
      if (res?.error) setError(res.error);
      else {
        setEditing(false);
        router.refresh();
      }
    });
  }

  function eliminar() {
    if (!confirm(`¿Eliminar la distribución de ${r.partner} en ${r.producto_nombre}?`)) return;
    const fd = new FormData();
    fd.set("id", String(r.id));
    startTransition(async () => {
      const res = await deleteDistribucionAction(fd);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <Fragment>
      <tr className={`border-t border-outline-variant ${estado === "Vencida" ? "opacity-60" : ""}`}>
        <td className="break-words px-3 py-2 text-body-sm text-on-surface">{r.partner}</td>
        <td className="px-3 py-2 text-right text-body-sm tabular-nums text-on-surface">
          {editing ? (
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className={`w-28 text-right ${inputClass}`}
            />
          ) : (
            <>
              {formatQty(r.cantidad)}
              <UnitTag unit={r.unidad} />
            </>
          )}
        </td>
        <td className="px-3 py-2 text-body-sm text-on-surface">
          {editing ? (
            <select value={hasta} onChange={(e) => setHasta(e.target.value)} className={inputClass}>
              {opciones.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          ) : (
            periodLabel(r.hasta_mes)
          )}
        </td>
        <td className="px-3 py-2">
          <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-label-sm font-semibold ${TAG[estado]}`}>
            {estado}
          </span>
        </td>
        {isAdmin && (
          <td className="px-3 py-2 text-right">
            {editing ? (
              <div className="flex justify-end gap-1">
                <button
                  onClick={guardar}
                  disabled={pending}
                  className="rounded-md bg-primary px-2.5 py-1 text-label-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-60"
                >
                  {pending ? "…" : "Guardar"}
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setCantidad(String(r.cantidad));
                    setHasta(r.hasta_mes);
                    setError(null);
                  }}
                  className="rounded-md px-2 py-1 text-label-sm text-on-surface-variant hover:bg-surface-container-high"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="flex justify-end gap-1">
                <button
                  onClick={() => setEditing(true)}
                  className="rounded-md border border-outline-variant px-2.5 py-1 text-label-sm font-medium text-on-surface-variant hover:bg-surface-container-high"
                >
                  Editar
                </button>
                <button
                  onClick={eliminar}
                  disabled={pending}
                  className="rounded-md px-2 py-1 text-label-sm text-secondary hover:underline disabled:opacity-50"
                >
                  Eliminar
                </button>
              </div>
            )}
          </td>
        )}
      </tr>
      {error && (
        <tr>
          <td colSpan={isAdmin ? 5 : 4} className="px-3 pb-2 text-body-sm text-secondary">
            {error}
          </td>
        </tr>
      )}
    </Fragment>
  );
}

type Hit = { partner: string };

/** Admin form: product (from the catalog), client (existing ones are suggested; a new name is allowed), quantity, until which month. */
function AddDistribucion({ meses, catalog, onClose }: { meses: Mes[]; catalog: CatalogProduct[]; onClose: () => void }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveDistribucionAction, null);
  const [producto, setProducto] = useState("");
  const [partner, setPartner] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const elegido = useMemo(() => {
    const t = producto.trim().toLowerCase();
    return t ? catalog.find((p) => p.producto_nombre.toLowerCase() === t || p.producto_ref.toLowerCase() === t) : undefined;
  }, [producto, catalog]);

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
      setProducto("");
      setPartner("");
      setHits([]);
      router.refresh();
    }
  }, [state, router]);

  // Suggest existing clients while typing (debounced).
  useEffect(() => {
    const term = partner.trim();
    if (term.length < 2) {
      setHits([]);
      setOpen(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clientes?${new URLSearchParams({ q: term, vendedor: "", producto_ref: "", period: "" })}`);
        const data = await res.json();
        if (!cancelled) {
          setHits(data.clientes ?? []);
          setActive(0);
          setOpen(true);
        }
      } catch {
        if (!cancelled) setHits([]);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [partner]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-4"
    >
      <div className="flex flex-col gap-1">
        <label className="text-label-sm text-on-surface-variant">Producto</label>
        <input
          name="producto"
          list="distribucion-productos"
          value={producto}
          onChange={(e) => setProducto(e.target.value)}
          required
          autoComplete="off"
          placeholder="Busca por nombre o código"
          className={`w-80 ${inputClass}`}
        />
        <datalist id="distribucion-productos">
          {catalog.map((p) => (
            <option key={p.producto_ref} value={p.producto_nombre}>
              {p.producto_ref}
            </option>
          ))}
        </datalist>
        <p className="h-4 text-label-sm text-on-surface-variant">{elegido ? `Código: ${elegido.producto_ref}` : ""}</p>
      </div>

      <div className="flex flex-col gap-1" ref={boxRef}>
        <label className="text-label-sm text-on-surface-variant">Cliente</label>
        <div className="relative">
          <input
            name="partner"
            value={partner}
            onChange={(e) => setPartner(e.target.value)}
            onFocus={() => hits.length > 0 && setOpen(true)}
            onKeyDown={(e) => {
              if (!open || hits.length === 0) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => (a + 1) % hits.length);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => (a - 1 + hits.length) % hits.length);
              } else if (e.key === "Enter") {
                e.preventDefault();
                setPartner(hits[active].partner);
                setOpen(false);
              } else if (e.key === "Escape") setOpen(false);
            }}
            required
            autoComplete="off"
            placeholder="Escribe y elige, o escribe uno nuevo"
            className={`w-72 ${inputClass}`}
          />
          {open && hits.length > 0 && (
            <ul className="absolute left-0 top-full z-30 mt-1 max-h-64 w-[26rem] max-w-[90vw] overflow-y-auto rounded-md border border-outline-variant bg-surface-container-lowest py-1 shadow-lg shadow-black/10">
              {hits.map((h, i) => (
                <li
                  key={h.partner}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setPartner(h.partner);
                    setOpen(false);
                  }}
                  className={`cursor-pointer px-3 py-1.5 text-body-sm ${i === active ? "bg-primary-fixed" : "hover:bg-primary-fixed/50"}`}
                >
                  {h.partner}
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="h-4" />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-label-sm text-on-surface-variant">
          Cantidad{elegido ? "" : ""}
        </label>
        <input name="cantidad" type="number" inputMode="decimal" min="0" step="any" required placeholder="0" className={`w-28 ${inputClass}`} />
        <p className="h-4" />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-label-sm text-on-surface-variant">Hasta qué mes</label>
        <select name="hasta_mes" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            Elige el mes
          </option>
          {meses.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <p className="h-4" />
      </div>

      <div className="flex items-center gap-2 pb-4">
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-md bg-primary px-4 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" onClick={onClose} className="h-10 rounded-md px-3 text-body-sm text-on-surface-variant hover:bg-surface-container-high">
          Cerrar
        </button>
      </div>
      {state?.error && <p className="w-full text-body-sm text-secondary">{state.error}</p>}
      {state?.success && <p className="w-full text-body-sm text-[#1b5e2f]">{state.success}</p>}
    </form>
  );
}
