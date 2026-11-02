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
import type { Distribucion, VendedorCliente } from "@/lib/distribucion";
import type { CatalogProduct } from "@/lib/sales";
import UnitTag from "./UnitTag";

type Mes = { value: string; label: string };
type Estado = "Vigente" | "Programada" | "Vencida";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** This month's distribution is "Vigente", a later month's is "Programada", an earlier one's is "Vencida". */
function estadoDe(mes: string, mesActual: string): Estado {
  return mes === mesActual ? "Vigente" : mes > mesActual ? "Programada" : "Vencida";
}

const TAG: Record<Estado, string> = {
  Vigente: "bg-edited text-[#1b5e2f]",
  Programada: "bg-progress text-[#7a4b00]",
  Vencida: "bg-surface-container-high text-on-surface-variant",
};

const TODOS = "todos";

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
  // Which month is shown: this one when it has distributions, otherwise all of them.
  const [mesFiltro, setMesFiltro] = useState<string>(() =>
    rows.some((r) => r.mes === mesActual) ? mesActual : TODOS
  );
  // Products start folded; a click on the header opens the list of clients.
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set());

  const term = norm(search.trim());
  const vencidas = rows.filter((r) => estadoDe(r.mes, mesActual) === "Vencida").length;

  // Month chips: every month that has distributions (past ones only when "Mostrar vencidas" is on).
  const chips = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const r of rows) {
      if (!verVencidas && estadoDe(r.mes, mesActual) === "Vencida") continue;
      cuenta.set(r.mes, (cuenta.get(r.mes) ?? 0) + 1);
    }
    return [...cuenta].sort(([a], [b]) => a.localeCompare(b)).map(([mes, n]) => ({ mes, n }));
  }, [rows, verVencidas, mesActual]);
  const filtroActivo = mesFiltro === TODOS || chips.some((c) => c.mes === mesFiltro) ? mesFiltro : TODOS;

  const grupos = useMemo(() => {
    const map = new Map<string, { ref: string; nombre: string; unidad: Distribucion["unidad"]; items: Distribucion[] }>();
    for (const r of rows) {
      if (!verVencidas && estadoDe(r.mes, mesActual) === "Vencida") continue;
      if (filtroActivo !== TODOS && r.mes !== filtroActivo) continue;
      if (term && !(norm(r.producto_nombre).includes(term) || norm(r.producto_ref).includes(term) || norm(r.partner).includes(term))) continue;
      const g = map.get(r.producto_ref) ?? { ref: r.producto_ref, nombre: r.producto_nombre, unidad: r.unidad, items: [] };
      g.items.push(r);
      map.set(r.producto_ref, g);
    }
    const total = (items: Distribucion[]) =>
      items.filter((i) => estadoDe(i.mes, mesActual) !== "Vencida").reduce((s, i) => s + i.cantidad, 0);
    return [...map.values()]
      .map((g) => ({
        ...g,
        items: [...g.items].sort((a, b) => a.mes.localeCompare(b.mes) || b.cantidad - a.cantidad),
        total: total(g.items),
      }))
      .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, "es"));
  }, [rows, term, verVencidas, mesActual, filtroActivo]);

  // Searching opens what matches, so the client you looked for is not hidden behind a fold.
  useEffect(() => {
    if (term) setAbiertos(new Set(grupos.map((g) => g.ref)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  function alternar(ref: string) {
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (!next.delete(ref)) next.add(ref);
      return next;
    });
  }

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

      {chips.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5" role="group" aria-label="Mes">
          <span className="mr-1 text-label-md uppercase tracking-wide text-on-surface-variant">Mes</span>
          {[{ mes: TODOS, n: rows.length - (verVencidas ? 0 : vencidas) }, ...chips].map((c) => {
            const activo = filtroActivo === c.mes;
            return (
              <button
                key={c.mes}
                type="button"
                onClick={() => setMesFiltro(c.mes)}
                aria-pressed={activo}
                className={`rounded-full border px-3 py-1 text-body-sm transition-colors ${
                  activo
                    ? "border-primary bg-primary text-on-primary"
                    : "border-outline-variant bg-surface-container-lowest text-on-surface hover:border-primary hover:text-primary"
                }`}
              >
                {c.mes === TODOS ? "Todos" : periodLabel(c.mes)}
                <span className={`ml-1.5 text-label-sm ${activo ? "opacity-80" : "text-on-surface-variant"}`}>{c.n}</span>
              </button>
            );
          })}
        </div>
      )}

      {isAdmin && adding && (
        <AddDistribucion
          meses={meses}
          catalog={catalog}
          mesInicial={filtroActivo === TODOS ? "" : filtroActivo}
          onSaved={(mes, ref) => {
            setMesFiltro(mes);
            if (ref) setAbiertos((prev) => new Set(prev).add(ref));
          }}
          onClose={() => setAdding(false)}
        />
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
          {grupos.map((g) => {
            const abierto = abiertos.has(g.ref);
            return (
              <section
                key={g.ref}
                className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm shadow-black/[0.04]"
              >
                <h3 className="m-0">
                  <button
                    type="button"
                    onClick={() => alternar(g.ref)}
                    aria-expanded={abierto}
                    className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-container-low"
                  >
                    <div className="flex min-w-0 items-start gap-2">
                      <span
                        className={`mt-1 shrink-0 text-on-surface-variant transition-transform ${abierto ? "rotate-90" : ""}`}
                        aria-hidden
                      >
                        ›
                      </span>
                      <div className="min-w-0">
                        <span className="block break-words text-body-lg font-semibold text-on-surface">{g.nombre}</span>
                        <span className="block text-label-sm font-normal text-on-surface-variant">{g.ref}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-label-sm uppercase tracking-wide text-on-surface-variant">Clientes</p>
                        <p className="text-body-md font-semibold tabular-nums text-on-surface">{g.items.length}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-label-sm uppercase tracking-wide text-on-surface-variant">
                      {filtroActivo === TODOS ? "Total" : "Distribuyendo"}
                    </p>
                        <p className="text-body-md font-semibold tabular-nums text-primary">
                          {formatQty(g.total)}
                          <UnitTag unit={g.unidad} />
                        </p>
                      </div>
                    </div>
                  </button>
                </h3>
                {abierto && (
                  <div className="thin-scroll overflow-x-auto border-t border-outline-variant">
                    <table className="w-full min-w-[760px] border-collapse">
                      <thead>
                        <tr className="bg-surface-container-low">
                          <th className="px-3 py-2 text-left text-label-md uppercase tracking-wide text-on-surface-variant">Cliente</th>
                          <th className="px-3 py-2 text-left text-label-md uppercase tracking-wide text-on-surface-variant">Vendedor</th>
                          <th className="px-3 py-2 text-left text-label-md uppercase tracking-wide text-on-surface-variant">Equipo</th>
                          <th className="px-3 py-2 text-left text-label-md uppercase tracking-wide text-on-surface-variant">Mes</th>
                          <th className="px-3 py-2 text-right text-label-md uppercase tracking-wide text-on-surface-variant">Cantidad</th>
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
                )}
              </section>
              );
          })}
        </div>
      )}
    </div>
  );
}

function Fila({ r, isAdmin, mesActual, meses }: { r: Distribucion; isAdmin: boolean; mesActual: string; meses: Mes[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [cantidad, setCantidad] = useState(String(r.cantidad));
  const [mes, setMes] = useState(r.mes);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const estado = estadoDe(r.mes, mesActual);
  // A distribution of a month that already passed is not in the "from this month on" list: keep its month selectable.
  const opciones = meses.some((m) => m.value === r.mes) ? meses : [{ value: r.mes, label: periodLabel(r.mes) }, ...meses];

  function guardar() {
    const fd = new FormData();
    fd.set("id", String(r.id));
    fd.set("cantidad", cantidad);
    fd.set("mes", mes);
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
        <td className="px-3 py-2 text-body-sm text-on-surface">
          <VendedorTag vendedores={r.vendedores} campo="vendedor" />
        </td>
        <td className="px-3 py-2 text-body-sm text-on-surface">
          <VendedorTag vendedores={r.vendedores} campo="equipo" />
        </td>
        <td className="px-3 py-2 text-body-sm text-on-surface">
          {editing ? (
            <select value={mes} onChange={(e) => setMes(e.target.value)} className={inputClass}>
              {opciones.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          ) : (
            periodLabel(r.mes)
          )}
        </td>
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
                    setMes(r.mes);
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
          <td colSpan={isAdmin ? 7 : 6} className="px-3 pb-2 text-body-sm text-secondary">
            {error}
          </td>
        </tr>
      )}
    </Fragment>
  );
}

type Hit = { partner: string; vendedores: VendedorCliente[] };

/**
 * The vendedor (or team) that sold to the client most recently, with "+N" when others did too. Hovering
 * it lists every vendedor with their team. The list is fixed-positioned so the table's scroll area
 * does not clip it.
 */
function VendedorTag({ vendedores, campo }: { vendedores: VendedorCliente[]; campo: keyof VendedorCliente }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  if (vendedores.length === 0) return <span className="text-on-surface-variant">—</span>;
  const valores = [...new Set(vendedores.map((v) => v[campo]))];
  const hay = vendedores.length > 1;
  return (
    <span
      className={hay ? "cursor-help" : undefined}
      onMouseEnter={(e) => {
        if (!hay) return;
        const r = e.currentTarget.getBoundingClientRect();
        setPos({ x: r.left, y: r.bottom + 4 });
      }}
      onMouseLeave={() => setPos(null)}
    >
      {valores[0]}
      {valores.length > 1 && (
        <span className="ml-1.5 rounded bg-surface-container-high px-1 py-0.5 text-label-sm text-on-surface-variant">
          +{valores.length - 1}
        </span>
      )}
      {pos && <VendedoresList vendedores={vendedores} pos={pos} />}
    </span>
  );
}

function VendedoresList({ vendedores, pos }: { vendedores: VendedorCliente[]; pos: { x: number; y: number } }) {
  return (
    <span
      role="tooltip"
      style={{ position: "fixed", left: Math.min(pos.x, window.innerWidth - 300), top: pos.y }}
      className="z-50 block w-72 max-w-[90vw] rounded-md border border-outline-variant bg-surface-container-lowest p-2 text-left shadow-lg shadow-black/10"
    >
      <span className="mb-1 block text-label-sm uppercase tracking-wide text-on-surface-variant">
        Vendedores del cliente ({vendedores.length})
      </span>
      {vendedores.map((v) => (
        <span key={`${v.vendedor}|${v.equipo}`} className="flex justify-between gap-3 py-0.5 text-body-sm text-on-surface">
          <span className="break-words">{v.vendedor}</span>
          <span className="shrink-0 text-on-surface-variant">{v.equipo}</span>
        </span>
      ))}
    </span>
  );
}

/** Admin form: product (from the catalog), client (existing ones are suggested; a new name is allowed), quantity, until which month. */
function AddDistribucion({
  meses,
  catalog,
  mesInicial,
  onSaved,
  onClose,
}: {
  meses: Mes[];
  catalog: CatalogProduct[];
  /** Month preselected: the one being viewed, when a single month is. */
  mesInicial: string;
  /** Called with the month and product just saved, so the list switches to that month and opens the product. */
  onSaved: (mes: string, producto_ref: string | undefined) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveDistribucionAction, null);
  // The form resets itself when the action ends, so the month that was sent is kept here.
  const mesEnviado = useRef("");
  const productoEnviado = useRef<string | undefined>(undefined);
  const [producto, setProducto] = useState("");
  const [partner, setPartner] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  // The suggestion the admin chose (or typed in full): its vendedor and team are shown under the field.
  const [picked, setPicked] = useState<Hit | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const elegido = useMemo(() => {
    const t = producto.trim().toLowerCase();
    return t ? catalog.find((p) => p.producto_nombre.toLowerCase() === t || p.producto_ref.toLowerCase() === t) : undefined;
  }, [producto, catalog]);

  useEffect(() => {
    if (state?.success) {
      if (mesEnviado.current) onSaved(mesEnviado.current, productoEnviado.current);
      formRef.current?.reset();
      setProducto("");
      setPartner("");
      setPicked(null);
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
    if (picked && picked.partner === partner) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clientes?${new URLSearchParams({ q: term, vendedor: "", producto_ref: "", period: "" })}`);
        const data = await res.json();
        if (!cancelled) {
          const found: Hit[] = data.clientes ?? [];
          setHits(found);
          setActive(0);
          setOpen(true);
          // Typing a client's full name is as good as picking it from the list.
          setPicked(found.find((h) => h.partner.toLowerCase() === term.toLowerCase()) ?? null);
        }
      } catch {
        if (!cancelled) setHits([]);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [partner]); // eslint-disable-line react-hooks/exhaustive-deps

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
      action={(fd) => {
        mesEnviado.current = String(fd.get("mes") ?? "");
        productoEnviado.current = elegido?.producto_ref;
        return formAction(fd);
      }}
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
            onChange={(e) => {
              setPartner(e.target.value);
              setPicked(null);
            }}
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
                setPicked(hits[active]);
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
                    setPicked(h);
                    setOpen(false);
                  }}
                  className={`cursor-pointer px-3 py-1.5 text-body-sm ${i === active ? "bg-primary-fixed" : "hover:bg-primary-fixed/50"}`}
                >
                  {h.partner}
                  <span className="block text-label-sm text-on-surface-variant">
                    {h.vendedores.length > 0
                      ? `${h.vendedores[0].vendedor} · ${h.vendedores[0].equipo}${h.vendedores.length > 1 ? ` (+${h.vendedores.length - 1})` : ""}`
                      : "Sin ventas registradas"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="h-4" />
      </div>

      <div className="flex min-w-48 flex-col gap-1">
        <label className="text-label-sm text-on-surface-variant">Vendedor y equipo</label>
        <div className="flex h-[34px] items-center text-body-sm text-on-surface">
          {picked && picked.vendedores.length > 0 ? (
            <span>
              <VendedorTag vendedores={picked.vendedores} campo="vendedor" />
              <span className="text-on-surface-variant"> · {picked.vendedores[0].equipo}</span>
            </span>
          ) : (
            <span className="text-on-surface-variant">{picked
                ? "Sin ventas registradas"
                : partner.trim() === ""
                  ? "Elige un cliente"
                  : hits.length > 0
                    ? "Elige uno de la lista"
                    : "Cliente nuevo, sin vendedor"}</span>
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
        <label className="text-label-sm text-on-surface-variant">Mes</label>
        <select name="mes" required defaultValue={mesInicial} className={inputClass}>
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
