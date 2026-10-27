"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { saveComparisonNoteAction } from "@/app/actions";
import { formatQty, formatUsdCompact, initials } from "@/lib/format";
import type { MonthComparison } from "@/lib/comparison";
import type { Unit } from "@/lib/units";
import { REGIONS, REGION_LABELS, type Region } from "@/lib/regions";
import UnitTag from "./UnitTag";

type Estado = "Al día" | "Atrasado" | "Superó la proyección" | "Sin proyectar" | "Sin venta" | "";
const ESTADOS: Exclude<Estado, "">[] = ["Al día", "Atrasado", "Superó la proyección", "Sin proyectar", "Sin venta"];

const TAG: Record<Exclude<Estado, "">, string> = {
  "Al día": "bg-edited text-[#1b5e2f]",
  Atrasado: "bg-secondary-fixed text-on-secondary-fixed-variant",
  "Superó la proyección": "bg-primary-fixed text-on-primary-fixed-variant",
  "Sin proyectar": "bg-progress text-[#7a4b00]",
  "Sin venta": "bg-surface-container-high text-on-surface-variant",
};
const BAR: Record<Exclude<Estado, "">, string> = {
  "Al día": "bg-[#2e8b4a]",
  Atrasado: "bg-secondary",
  "Superó la proyección": "bg-primary",
  "Sin proyectar": "bg-primary",
  "Sin venta": "bg-outline-variant",
};

type Cliente = { partner: string; pq: number; pu: number; rq: number; ru: number };
type Prod = {
  ref: string;
  nombre: string;
  unit: Unit;
  cat: string;
  pq: number;
  pu: number;
  rq: number;
  ru: number;
  estado: Estado;
  clientes: Cliente[];
};

type SortKey = "proy" | "vend" | "pct" | "falta";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const noteKey = (v: string, ref: string, partner: string) => `${v}|${ref}|${partner}`;

function estadoDe(pq: number, rq: number, avance: number): Estado {
  if (pq <= 0 && rq > 0) return "Sin proyectar";
  if (pq > 0 && rq <= 0) return "Sin venta";
  if (pq <= 0) return "";
  const p = rq / pq;
  return p > 1 ? "Superó la proyección" : p >= avance ? "Al día" : "Atrasado";
}

const pctOf = (r: number, p: number) => (p > 0 ? Math.round((r / p) * 100) : null);

function Bar({ real, proy, estado, avance }: { real: number; proy: number; estado: Estado; avance: number }) {
  const w = proy > 0 ? Math.min(real / proy, 1) * 100 : real > 0 ? 100 : 0;
  return (
    <div className="relative mt-1 h-1.5 rounded-full bg-surface-container-high">
      <div className={`absolute inset-y-0 left-0 rounded-full ${BAR[estado || "Sin venta"]}`} style={{ width: `${w}%` }} />
      <div className="absolute -inset-y-[3px] w-0.5 rounded-sm bg-secondary" style={{ left: `${avance * 100}%` }} />
    </div>
  );
}

function Tag({ estado }: { estado: Estado }) {
  if (!estado) return null;
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-label-sm font-semibold ${TAG[estado]}`}>{estado}</span>;
}

/** Projected minus sold so far; negative = already sold above the projection. */
function Falta({ pq, rq, unit }: { pq: number; rq: number; unit: Unit }) {
  if (pq <= 0 && rq <= 0) return null;
  const d = pq - rq;
  return d >= 0 ? (
    <span>
      {formatQty(d)}
      <UnitTag unit={unit} />
    </span>
  ) : (
    <span className="font-semibold text-on-primary-fixed-variant">
      −{formatQty(-d)}
      <UnitTag unit={unit} />
    </span>
  );
}

function KpiCard({
  title,
  real,
  proy,
  fmt,
  suffix,
  avance,
}: {
  title: string;
  real: number;
  proy: number;
  fmt: (n: number) => string;
  suffix: string;
  avance: number;
}) {
  const pc = pctOf(real, proy);
  const estado: Estado = proy <= 0 ? "Sin venta" : real / proy > 1 ? "Superó la proyección" : real / proy >= avance ? "Al día" : "Atrasado";
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3.5 shadow-sm shadow-black/[0.04]">
      <p className="text-label-md uppercase tracking-wide text-on-surface-variant">{title}</p>
      <p className="text-headline-md font-semibold tabular-nums text-primary">
        {fmt(real)} <span className="text-label-sm font-normal text-on-surface-variant">de {fmt(proy)}{suffix}</span>
      </p>
      <p className="text-label-sm text-on-surface-variant">
        {pc === null ? "—" : `${pc}% vendido`}
        {proy > 0 ? ` · faltan ${fmt(Math.max(proy - real, 0))}` : ""}
      </p>
      <Bar real={real} proy={proy} estado={estado} avance={avance} />
    </div>
  );
}

const selectClass =
  "h-9 rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-body-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

export default function ComparisonView({
  data,
  isAdmin,
  ownVendedor,
  dia,
  diasMes,
  hastaLabel,
}: {
  data: MonthComparison;
  isAdmin: boolean;
  ownVendedor: string | null;
  dia: number;
  diasMes: number;
  hastaLabel: string | null;
}) {
  const router = useRouter();
  const avance = Math.min(dia / diasMes, 1);
  const [notas, setNotas] = useState<Record<string, string>>(data.notas);
  useEffect(() => setNotas(data.notas), [data.notas]);

  const [fSede, setFSede] = useState("");
  const [fVend, setFVend] = useState("");
  const [fCat, setFCat] = useState("");
  const [fEstado, setFEstado] = useState("");
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<{ t: "p" | "c"; v: string } | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "proy", dir: -1 });
  const [open, setOpen] = useState<Set<string>>(new Set(ownVendedor ? [ownVendedor] : []));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [allOpen, setAllOpen] = useState(false);

  // vendedor -> product -> clients
  const vendedores = useMemo(() => {
    const map = new Map<string, Map<string, Prod>>();
    for (const [v, ref, partner, pq, pu, rq, ru] of data.rows) {
      let vv = map.get(v);
      if (!vv) map.set(v, (vv = new Map()));
      let pr = vv.get(ref);
      if (!pr) {
        const info = data.productos[ref];
        vv.set(
          ref,
          (pr = { ref, nombre: info?.n ?? ref, unit: info?.u ?? "kg", cat: info?.c ?? "Sin categoría", pq: 0, pu: 0, rq: 0, ru: 0, estado: "", clientes: [] })
        );
      }
      pr.pq += pq;
      pr.pu += pu;
      pr.rq += rq;
      pr.ru += ru;
      pr.clientes.push({ partner, pq, pu, rq, ru });
    }
    for (const vv of map.values()) for (const pr of vv.values()) pr.estado = estadoDe(pr.pq, pr.rq, avance);
    return map;
  }, [data.rows, data.productos, avance]);

  const isPending = (v: string, ref: string, c: Cliente) =>
    estadoDe(c.pq, c.rq, avance) === "Superó la proyección" && !notas[noteKey(v, ref, c.partner)]?.trim();
  const pendingIn = (v: string, pr: Prod) => pr.clientes.filter((c) => isPending(v, pr.ref, c)).length;

  const categorias = useMemo(
    () => [...new Set(Object.values(data.productos).map((p) => p.c))].sort((a, b) => a.localeCompare(b, "es")),
    [data.productos]
  );
  const sedeDe = (v: string) => data.sedes[v] ?? "";
  const sedeLabel = (v: string) => REGION_LABELS[sedeDe(v) as Region] ?? "";
  // Sedes that actually have data, in the usual order; the vendedor list narrows to the chosen sede.
  const sedesConDatos = useMemo(
    () => REGIONS.filter((r) => [...vendedores.keys()].some((v) => data.sedes[v] === r)),
    [vendedores, data.sedes]
  );
  const nombresVend = useMemo(
    () =>
      [...vendedores.keys()]
        .filter((v) => !fSede || data.sedes[v] === fSede)
        .sort((a, b) => a.localeCompare(b, "es")),
    [vendedores, fSede, data.sedes]
  );
  const term = norm(q.trim());

  function visibleProducts(v: string): Prod[] {
    const list: Prod[] = [];
    for (const pr of vendedores.get(v)!.values()) {
      if (fCat && pr.cat !== fCat) continue;
      if (fEstado && pr.estado !== fEstado) continue;
      if (soloPendientes && pendingIn(v, pr) === 0) continue;
      if (pick) {
        const ok = pick.t === "p" ? pr.ref === pick.v : pr.clientes.some((c) => c.partner === pick.v);
        if (!ok) continue;
      }
      if (term && !pick) {
        const hay = norm(pr.nombre).includes(term) || norm(pr.ref).includes(term) || pr.clientes.some((c) => norm(c.partner).includes(term));
        if (!hay) continue;
      }
      list.push(pr);
    }
    const value = (p: Prod) =>
      sort.key === "proy" ? p.pq : sort.key === "vend" ? p.rq : sort.key === "falta" ? p.pq - p.rq : p.pq > 0 ? p.rq / p.pq : p.rq > 0 ? 9e9 : -1;
    return list.sort((a, b) => sort.dir * (value(a) - value(b)));
  }

  const blocks = useMemo(() => {
    const names = fVend ? [fVend] : nombresVend; // nombresVend already respects the sede
    const out: { v: string; prods: Prod[]; t: Totals; pendientes: number }[] = [];
    for (const v of names) {
      if (!vendedores.has(v)) continue;
      if (soloPendientes && !isAdmin && v !== ownVendedor) continue;
      const prods = visibleProducts(v);
      if (prods.length === 0) continue;
      out.push({ v, prods, t: totals(prods), pendientes: prods.reduce((s, p) => s + pendingIn(v, p), 0) });
    }
    const mio = (v: string) => (v === ownVendedor ? -1 : 0); // your own section comes first
    return out.sort((a, b) => mio(a.v) - mio(b.v) || b.t.uR + b.t.uP - (a.t.uR + a.t.uP));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendedores, fVend, fCat, fEstado, soloPendientes, pick, term, sort, notas, nombresVend, avance]);

  const all = blocks.flatMap((b) => b.prods);
  const T = totals(all);
  const pendientesTotal = useMemo(() => {
    let n = 0;
    for (const [v, vv] of vendedores) {
      if (fSede && data.sedes[v] !== fSede) continue;
      if (!isAdmin && v !== ownVendedor) continue; // a vendedor is only asked about their own clients
      for (const pr of vv.values()) n += pendingIn(v, pr);
    }
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendedores, notas, avance, fSede, data.sedes, isAdmin, ownVendedor]);

  const forceOpen = !!fVend || !!term || !!pick || soloPendientes;
  // A sede/vendedor pair that doesn't match (chosen before the sede) would show nothing: reset it.
  const cambiarSede = (sede: string) => {
    setFSede(sede);
    if (fVend && sede && data.sedes[fVend] !== sede) setFVend("");
  };

  return (
    <div>
      {pendientesTotal > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-error-container bg-error-container px-4 py-3 text-on-error-container">
          <p className="text-body-sm">
            <strong>
              {pendientesTotal} cliente{pendientesTotal === 1 ? "" : "s"}
              {!isAdmin && (pendientesTotal === 1 ? " tuyo" : " tuyos")}
            </strong>{" "}
            superaron su proyección y falta {isAdmin ? "una observación." : "tu observación. Escribe qué pasó con cada uno."}
          </p>
          <button
            onClick={() => setSoloPendientes((s) => !s)}
            className="rounded-md border border-on-error-container/30 px-3 py-1.5 text-body-sm font-medium hover:bg-on-error-container/10"
          >
            {soloPendientes ? "Ver todos" : "Ver pendientes"}
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {sedesConDatos.length > 1 && (
          <select value={fSede} onChange={(e) => cambiarSede(e.target.value)} className={selectClass} aria-label="Sede">
            <option value="">Todas las sedes</option>
            {sedesConDatos.map((r) => (
              <option key={r} value={r}>
                {REGION_LABELS[r]}
              </option>
            ))}
          </select>
        )}
        {nombresVend.length > 1 && (
          <select value={fVend} onChange={(e) => setFVend(e.target.value)} className={selectClass} aria-label="Vendedor">
            <option value="">Todos los vendedores</option>
            {nombresVend.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        )}
        <select value={fCat} onChange={(e) => setFCat(e.target.value)} className={selectClass} aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} className={selectClass} aria-label="Estado">
          <option value="">Todos los estados</option>
          {ESTADOS.map((e) => (
            <option key={e}>{e}</option>
          ))}
        </select>
        <SearchBox
          vendedores={vendedores}
          sedes={data.sedes}
          fSede={fSede}
          fVend={fVend}
          fCat={fCat}
          q={q}
          onType={(v) => {
            setQ(v);
            setPick(null);
          }}
          onPick={(p, label) => {
            setPick(p);
            setQ(label);
          }}
        />
        <button
          onClick={() => {
            setAllOpen((a) => !a);
            setOpen(allOpen ? new Set() : new Set(vendedores.keys()));
          }}
          className="ml-auto h-9 rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-body-sm font-medium hover:bg-surface-container-high"
        >
          {allOpen ? "Contraer todo" : "Expandir todo"}
        </button>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3.5 shadow-sm shadow-black/[0.04]">
          <p className="text-label-md uppercase tracking-wide text-on-surface-variant">Avance del mes</p>
          <p className="text-headline-md font-semibold tabular-nums text-primary">
            {dia} <span className="text-label-sm font-normal text-on-surface-variant">de {diasMes} días</span>
          </p>
          <p className="text-label-sm text-on-surface-variant">
            {Math.round(avance * 100)}% del mes transcurrido{hastaLabel ? ` · ventas al ${hastaLabel}` : ""}
          </p>
          <Bar real={avance} proy={1} estado="Al día" avance={avance} />
        </div>
        <KpiCard title="Kilogramos" real={T.kgR} proy={T.kgP} fmt={formatQty} suffix=" kg" avance={avance} />
        <KpiCard title="Unidades" real={T.unR} proy={T.unP} fmt={formatQty} suffix=" und" avance={avance} />
        <KpiCard title="Ingreso (US$)" real={T.uR} proy={T.uP} fmt={formatUsdCompact} suffix="" avance={avance} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-label-sm text-on-surface-variant">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-0.5 bg-secondary" /> Marca roja: avance del mes
        </span>
        {ESTADOS.map((e) => (
          <Tag key={e} estado={e} />
        ))}
        <span>
          Falta = proyectado − vendido (<span className="font-semibold text-on-primary-fixed-variant">−</span> = ya vendió por encima)
        </span>
      </div>

      {blocks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-10 text-center text-body-md text-on-surface-variant">
          Ningún producto cumple los filtros.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {blocks.map(({ v, prods, t, pendientes }) => {
            const isOpen = forceOpen || open.has(v);
            const estado: Estado = t.uP <= 0 ? "Sin venta" : t.uR / t.uP > 1 ? "Superó la proyección" : t.uR / t.uP >= avance ? "Al día" : "Atrasado";
            return (
              <section key={v} className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm shadow-black/[0.04]">
                <button
                  onClick={() =>
                    setOpen((o) => {
                      const n = new Set(o);
                      n.has(v) ? n.delete(v) : n.add(v);
                      return n;
                    })
                  }
                  className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left hover:bg-surface-container-low"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-container text-label-md text-on-primary-container">
                      {initials(v)}
                    </span>
                    <div>
                      <h3 className="text-body-lg font-semibold text-on-surface">
                        {v}
                        {v === ownVendedor && (
                          <span className="ml-2 rounded bg-primary-fixed px-1.5 py-0.5 text-label-sm font-medium text-on-primary-fixed-variant">
                            Tú
                          </span>
                        )}
                        {sedeLabel(v) && (
                          <span className="ml-2 rounded bg-surface-container-high px-1.5 py-0.5 text-label-sm font-medium text-on-surface-variant">
                            {sedeLabel(v)}
                          </span>
                        )}
                      </h3>
                      <p className="text-label-sm text-on-surface-variant">
                        {prods.length} producto{prods.length === 1 ? "" : "s"}
                        {pendientes > 0 && (
                          <span className="ml-2 rounded bg-error-container px-1.5 py-0.5 font-medium text-on-error-container">
                            {pendientes} sin observación
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="hidden text-right md:block">
                      <p className="text-label-sm uppercase tracking-wide text-on-surface-variant">Proyectado</p>
                      <p className="text-body-md font-semibold tabular-nums text-on-surface">
                        {formatQty(t.kgP)} kg · {formatQty(t.unP)} und
                      </p>
                    </div>
                    <div className="hidden text-right md:block">
                      <p className="text-label-sm uppercase tracking-wide text-on-surface-variant">Vendido</p>
                      <p className="text-body-md font-semibold tabular-nums text-primary">
                        {formatQty(t.kgR)} kg · {formatQty(t.unR)} und
                      </p>
                    </div>
                    <div className="w-[92px] text-right">
                      <p className="text-label-sm uppercase tracking-wide text-on-surface-variant">
                        {pctOf(t.uR, t.uP) === null ? "—" : `${pctOf(t.uR, t.uP)}% US$`}
                      </p>
                      <Bar real={t.uR} proy={t.uP} estado={estado} avance={avance} />
                    </div>
                    <span className={`text-on-surface-variant transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden>
                      ▾
                    </span>
                  </div>
                </button>

                {isOpen && (
                  <div className="thin-scroll overflow-x-auto border-t border-outline-variant">
                    <table className="w-full min-w-[760px] border-collapse">
                      <thead>
                        <tr className="border-b border-outline-variant bg-surface-container-low">
                          <Th left>
                            Producto{" "}
                            <span className="ml-1 rounded bg-surface-container-high px-1.5 py-0.5 normal-case tracking-normal">{prods.length}</span>
                          </Th>
                          <Th><SortBtn k="proy" label="Proyectado" sort={sort} setSort={setSort} /></Th>
                          <Th><SortBtn k="vend" label="Vendido a hoy" sort={sort} setSort={setSort} /></Th>
                          <Th><SortBtn k="pct" label="Avance" sort={sort} setSort={setSort} /></Th>
                          <Th><SortBtn k="falta" label="Falta" sort={sort} setSort={setSort} /></Th>
                          <Th>Estado</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {prods.map((p) => {
                          const key = `${v}|${p.ref}`;
                          const ex = expanded.has(key);
                          const pend = pendingIn(v, p);
                          return (
                            <Fragment key={key}>
                              <tr
                                onClick={() =>
                                  setExpanded((s) => {
                                    const n = new Set(s);
                                    n.has(key) ? n.delete(key) : n.add(key);
                                    return n;
                                  })
                                }
                                className="cursor-pointer border-b border-outline-variant hover:bg-surface-container-low"
                              >
                                <td className="px-3 py-2">
                                  <div className="flex items-start gap-2">
                                    <span className={`mt-0.5 shrink-0 text-on-surface-variant transition-transform ${ex ? "rotate-90" : ""}`} aria-hidden>›</span>
                                    <div className="min-w-0">
                                      <p className="break-words text-body-sm font-medium text-on-surface">
                                        {p.nombre}
                                        {pend > 0 && (
                                          <span className="ml-2 rounded bg-error-container px-1.5 py-0.5 text-label-sm font-semibold text-on-error-container" title="Clientes que superaron su proyección sin observación">
                                            ⚠ {pend}
                                          </span>
                                        )}
                                      </p>
                                      <p className="text-label-sm text-on-surface-variant">{p.ref}</p>
                                    </div>
                                  </div>
                                </td>
                                <Num>{formatQty(p.pq)}<UnitTag unit={p.unit} /></Num>
                                <Num>{formatQty(p.rq)}<UnitTag unit={p.unit} /></Num>
                                <td className="min-w-[120px] px-3 py-2">
                                  {p.pq > 0 && <p className="text-right text-label-md font-semibold tabular-nums">{pctOf(p.rq, p.pq)}%</p>}
                                  <Bar real={p.rq} proy={p.pq} estado={p.estado} avance={avance} />
                                </td>
                                <Num><Falta pq={p.pq} rq={p.rq} unit={p.unit} /></Num>
                                <td className="px-3 py-2 text-right"><Tag estado={p.estado} /></td>
                              </tr>
                              {ex && (
                                <tr>
                                  <td colSpan={6} className="p-0">
                                    <Clientes
                                      v={v}
                                      p={p}
                                      period={data.period}
                                      avance={avance}
                                      notas={notas}
                                      canNote={isAdmin || v === ownVendedor}
                                      highlight={pick?.t === "c" ? pick.v : term}
                                      onNote={(partner, nota) => {
                                        setNotas((n) => ({ ...n, [noteKey(v, p.ref, partner)]: nota }));
                                        router.refresh();
                                      }}
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
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

type Totals = { kgP: number; kgR: number; unP: number; unR: number; uP: number; uR: number };
function totals(list: Prod[]): Totals {
  const t = { kgP: 0, kgR: 0, unP: 0, unR: 0, uP: 0, uR: 0 };
  for (const p of list) {
    if (p.unit === "und") {
      t.unP += p.pq;
      t.unR += p.rq;
    } else {
      t.kgP += p.pq;
      t.kgR += p.rq;
    }
    t.uP += p.pu;
    t.uR += p.ru;
  }
  return t;
}

function Th({ children, left }: { children?: ReactNode; left?: boolean }) {
  return (
    <th className={`whitespace-nowrap px-3 py-2 text-label-md uppercase tracking-wide text-on-surface-variant ${left ? "text-left" : "text-right"}`}>
      {children}
    </th>
  );
}

function Num({ children }: { children: ReactNode }) {
  return <td className="px-3 py-2 text-right text-body-sm tabular-nums text-on-surface">{children}</td>;
}

function SortBtn({
  k,
  label,
  sort,
  setSort,
}: {
  k: SortKey;
  label: string;
  sort: { key: SortKey; dir: 1 | -1 };
  setSort: (s: { key: SortKey; dir: 1 | -1 }) => void;
}) {
  const on = sort.key === k;
  return (
    <button
      onClick={() => setSort({ key: k, dir: on ? (sort.dir === 1 ? -1 : 1) : -1 })}
      className={`inline-flex items-center gap-1 uppercase ${on ? "text-primary" : ""}`}
    >
      {label}
      <span aria-hidden>{on ? (sort.dir === 1 ? "▲" : "▼") : "↕"}</span>
    </button>
  );
}

/** Client breakdown of a product, with the "superó la proyección" alert asking for an observation. */
function Clientes({
  v,
  p,
  period,
  avance,
  notas,
  canNote,
  highlight,
  onNote,
}: {
  v: string;
  p: Prod;
  period: string;
  avance: number;
  notas: Record<string, string>;
  canNote: boolean;
  highlight: string;
  onNote: (partner: string, nota: string) => void;
}) {
  const rows = [...p.clientes].sort((a, b) => b.rq + b.pq - (a.rq + a.pq));
  return (
    <div className="bg-surface-container-low px-4 py-3">
      <p className="mb-2 text-label-md uppercase tracking-wide text-on-surface-variant">
        Clientes &middot; proyección por cliente vs. ventas del mes
      </p>
      <div className="overflow-hidden rounded-md border border-outline-variant bg-surface-container-lowest">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low">
              <th className="px-3 py-1.5 text-left text-label-sm uppercase tracking-wide text-on-surface-variant">Cliente</th>
              <th className="px-3 py-1.5 text-right text-label-sm uppercase tracking-wide text-on-surface-variant">Proyectado</th>
              <th className="px-3 py-1.5 text-right text-label-sm uppercase tracking-wide text-on-surface-variant">Vendido</th>
              <th className="px-3 py-1.5 text-right text-label-sm uppercase tracking-wide text-on-surface-variant">Avance</th>
              <th className="px-3 py-1.5 text-right text-label-sm uppercase tracking-wide text-on-surface-variant">Falta</th>
              <th className="px-3 py-1.5 text-right text-label-sm uppercase tracking-wide text-on-surface-variant">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const estado = estadoDe(c.pq, c.rq, avance);
              const key = noteKey(v, p.ref, c.partner);
              const hit = highlight && norm(c.partner).includes(norm(highlight));
              return (
                <Fragment key={c.partner}>
                  <tr className={`border-b border-outline-variant last:border-b-0 ${hit ? "bg-primary-fixed/40" : ""}`}>
                    <td className="break-words px-3 py-1.5 text-body-sm text-on-surface">{c.partner}</td>
                    <Num>{formatQty(c.pq)}<UnitTag unit={p.unit} /></Num>
                    <Num>{formatQty(c.rq)}<UnitTag unit={p.unit} /></Num>
                    <td className="min-w-[110px] px-3 py-1.5">
                      {c.pq > 0 && <p className="text-right text-label-md font-semibold tabular-nums">{pctOf(c.rq, c.pq)}%</p>}
                      <Bar real={c.rq} proy={c.pq} estado={estado} avance={avance} />
                    </td>
                    <Num><Falta pq={c.pq} rq={c.rq} unit={p.unit} /></Num>
                    <td className="px-3 py-1.5 text-right"><Tag estado={estado} /></td>
                  </tr>
                  {estado === "Superó la proyección" && (
                    <tr className="border-b border-outline-variant last:border-b-0">
                      <td colSpan={6} className="p-0">
                        <NoteRow period={period} v={v} p={p} partner={c.partner} nota={notas[key] ?? ""} canNote={canNote} onSaved={(n) => onNote(c.partner, n)} />
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
  );
}

function NoteRow({
  period,
  v,
  p,
  partner,
  nota,
  canNote,
  onSaved,
}: {
  period: string;
  v: string;
  p: Prod;
  partner: string;
  nota: string;
  canNote: boolean;
  onSaved: (nota: string) => void;
}) {
  const [text, setText] = useState(nota);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  useEffect(() => setText(nota), [nota]);
  const hasNote = nota.trim() !== "";

  function save() {
    const fd = new FormData();
    fd.set("period", period);
    fd.set("vendedor", v);
    fd.set("producto_ref", p.ref);
    fd.set("partner", partner);
    fd.set("nota", text);
    setError(null);
    startTransition(async () => {
      const res = await saveComparisonNoteAction(fd);
      if (res?.error) setError(res.error);
      else {
        setEditing(false);
        onSaved(text.trim());
      }
    });
  }

  if (hasNote && !editing) {
    return (
      <div className="flex flex-wrap items-start justify-between gap-2 bg-primary-fixed/40 px-3 py-2">
        <p className="text-body-sm text-on-surface">
          <span className="font-semibold text-on-primary-fixed-variant">Observación: </span>
          {nota}
        </p>
        {canNote && (
          <button onClick={() => setEditing(true)} className="text-label-sm font-medium text-primary hover:underline">
            Editar
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 bg-error-container px-3 py-2">
      <p className="text-body-sm text-on-error-container">
        <strong>⚠ {partner}</strong> superó su proyección.
        {canNote ? " Agrega una observación:" : " Aún sin observación del vendedor."}
      </p>
      {canNote && (
        <>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && text.trim() && save()}
            maxLength={500}
            placeholder="Ej. pedido extra por campaña, cliente nuevo, adelanto de compra…"
            className="min-w-[260px] flex-1 rounded-md border border-on-error-container/30 bg-surface-container-lowest px-2 py-1.5 text-body-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <button
            onClick={save}
            disabled={pending || !text.trim()}
            className="rounded-md bg-primary px-3 py-1.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Guardando…" : "Guardar"}
          </button>
          {editing && (
            <button onClick={() => { setEditing(false); setText(nota); }} className="text-body-sm text-on-error-container hover:underline">
              Cancelar
            </button>
          )}
        </>
      )}
      {error && <p className="w-full text-body-sm text-secondary">{error}</p>}
    </div>
  );
}

/** Search box with suggestions: type to see matching products and clients, pick one to filter exactly. */
function SearchBox({
  vendedores,
  sedes,
  fSede,
  fVend,
  fCat,
  q,
  onType,
  onPick,
}: {
  vendedores: Map<string, Map<string, Prod>>;
  sedes: Record<string, string>;
  fSede: string;
  fVend: string;
  fCat: string;
  q: string;
  onType: (v: string) => void;
  onPick: (p: { t: "p" | "c"; v: string }, label: string) => void;
}) {
  const [focus, setFocus] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const term = norm(q.trim());

  const items = useMemo(() => {
    if (term.length < 2) return [];
    const prods = new Map<string, Prod>();
    const clis = new Set<string>();
    for (const [v, vv] of vendedores) {
      if (fVend && v !== fVend) continue;
      if (fSede && sedes[v] !== fSede) continue;
      for (const pr of vv.values()) {
        if (fCat && pr.cat !== fCat) continue;
        prods.set(pr.ref, pr);
        for (const c of pr.clientes) clis.add(c.partner);
      }
    }
    const rank = (name: string) => {
      const n = norm(name);
      return n.startsWith(term) ? 0 : n.includes(" " + term) ? 1 : n.includes(term) ? 2 : 9;
    };
    const pm = [...prods.values()]
      .map((p) => ({ t: "p" as const, v: p.ref, name: p.nombre, sub: p.ref, r: Math.min(rank(p.nombre), rank(p.ref)) }))
      .filter((x) => x.r < 9)
      .sort((a, b) => a.r - b.r || a.name.localeCompare(b.name, "es"))
      .slice(0, 8);
    const cm = [...clis]
      .map((c) => ({ t: "c" as const, v: c, name: c, sub: "", r: rank(c) }))
      .filter((x) => x.r < 9)
      .sort((a, b) => a.r - b.r || a.name.localeCompare(b.name, "es"))
      .slice(0, 6);
    return [...pm, ...cm];
  }, [term, vendedores, sedes, fSede, fVend, fCat]);

  useEffect(() => setActive(0), [term]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setFocus(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const show = focus && term.length >= 2;
  const choose = (i: number) => {
    const it = items[i];
    if (!it) return;
    onPick({ t: it.t, v: it.v }, it.name);
    setFocus(false);
  };

  const hl = (text: string) => {
    const i = norm(text).indexOf(term);
    if (i < 0) return text;
    return (
      <>
        {text.slice(0, i)}
        <mark className="bg-transparent font-bold text-primary">{text.slice(i, i + term.length)}</mark>
        {text.slice(i + term.length)}
      </>
    );
  };

  return (
    <div className="relative" ref={boxRef}>
      <input
        type="search"
        value={q}
        onChange={(e) => {
          onType(e.target.value);
          setFocus(true);
        }}
        onFocus={() => setFocus(true)}
        onKeyDown={(e) => {
          if (!show || items.length === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % items.length); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + items.length) % items.length); }
          else if (e.key === "Enter") { e.preventDefault(); choose(active); }
          else if (e.key === "Escape") setFocus(false);
        }}
        placeholder="Buscar producto, código o cliente…"
        autoComplete="off"
        className={`w-64 ${selectClass}`}
      />
      {show && (
        <div className="absolute left-0 top-full z-30 mt-1 max-h-96 w-[26rem] max-w-[90vw] overflow-y-auto rounded-lg border border-outline-variant bg-surface-container-lowest py-1 shadow-lg shadow-black/10">
          {items.length === 0 ? (
            <p className="px-3 py-3 text-body-sm text-on-surface-variant">Sin coincidencias</p>
          ) : (
            items.map((it, i) => (
              <Fragment key={`${it.t}-${it.v}`}>
                {(i === 0 || items[i - 1].t !== it.t) && (
                  <p className="px-3 pb-1 pt-2 text-label-sm font-semibold uppercase tracking-wide text-on-surface-variant">
                    {it.t === "p" ? "Productos" : "Clientes"}
                  </p>
                )}
                <div
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(i);
                  }}
                  className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-1.5 text-body-sm ${i === active ? "bg-primary-fixed" : "hover:bg-primary-fixed/50"}`}
                >
                  <span>{hl(it.name)}</span>
                  <small className="shrink-0 text-label-sm text-on-surface-variant">{it.sub}</small>
                </div>
              </Fragment>
            ))
          )}
        </div>
      )}
    </div>
  );
}
