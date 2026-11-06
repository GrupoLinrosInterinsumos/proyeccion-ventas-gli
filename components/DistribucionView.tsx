"use client";

import { useEffect, useMemo, useState } from "react";
import { formatQty } from "@/lib/format";
import { periodLabel } from "@/lib/period";
import type { Distribucion } from "@/lib/distribucion";
import UnitTag from "./UnitTag";

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
const SIN_EQUIPO = "Sin equipo";
const SIN_VENDEDOR = "Sin vendedor";
/** Separator of the keys of the open/closed folds: product, product + team, product + team + vendedor. */
const SEP = "::";

type GrupoEquipo = {
  equipo: string;
  total: number;
  clientes: number;
  vendedores: { vendedor: string; total: number; clientes: number; items: Distribucion[] }[];
};

/** One product's rows grouped by sales team and then by vendedor. Past months do not add to a total. */
function agruparPorEquipo(items: Distribucion[], mesActual: string): GrupoEquipo[] {
  const porEquipo = new Map<string, Map<string, Distribucion[]>>();
  for (const r of items) {
    const equipo = r.equipo || SIN_EQUIPO;
    const vendedor = r.vendedor || SIN_VENDEDOR;
    const porVendedor = porEquipo.get(equipo) ?? new Map<string, Distribucion[]>();
    porVendedor.set(vendedor, [...(porVendedor.get(vendedor) ?? []), r]);
    porEquipo.set(equipo, porVendedor);
  }
  const suma = (rs: Distribucion[]) =>
    rs.filter((i) => estadoDe(i.mes, mesActual) !== "Vencida").reduce((t, i) => t + i.cantidad, 0);
  return [...porEquipo]
    .map(([equipo, porVendedor]) => {
      const todos = [...porVendedor.values()].flat();
      return {
        equipo,
        total: suma(todos),
        clientes: new Set(todos.map((i) => i.partner)).size,
        vendedores: [...porVendedor]
          .map(([vendedor, rs]) => ({
            vendedor,
            total: suma(rs),
            clientes: new Set(rs.map((i) => i.partner)).size,
            items: [...rs].sort((a, b) => a.mes.localeCompare(b.mes) || b.cantidad - a.cantidad),
          }))
          .sort((a, b) => b.total - a.total || a.vendedor.localeCompare(b.vendedor, "es")),
      };
    })
    .sort(
      (a, b) =>
        Number(a.equipo === SIN_EQUIPO) - Number(b.equipo === SIN_EQUIPO) ||
        b.total - a.total ||
        a.equipo.localeCompare(b.equipo, "es")
    );
}

/** Fold keys of every team and vendedor of a product, to open them all at once. */
function clavesDeProducto(ref: string, equipos: GrupoEquipo[]): string[] {
  return equipos.flatMap((e) => [
    `${ref}${SEP}${e.equipo}`,
    ...e.vendedores.map((v) => `${ref}${SEP}${e.equipo}${SEP}${v.vendedor}`),
  ]);
}

const inputClass =
  "rounded-md border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-body-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

export default function DistribucionView({ rows, mesActual }: { rows: Distribucion[]; mesActual: string }) {
  const [search, setSearch] = useState("");
  const [verVencidas, setVerVencidas] = useState(false);
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
      if (
        term &&
        !(
          norm(r.producto_nombre).includes(term) ||
          norm(r.producto_ref).includes(term) ||
          norm(r.partner).includes(term) ||
          norm(r.vendedor).includes(term) ||
          norm(r.equipo).includes(term)
        )
      )
        continue;
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
        equipos: agruparPorEquipo(g.items, mesActual),
      }))
      .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, "es"));
  }, [rows, term, verVencidas, mesActual, filtroActivo]);

  // Searching opens what matches (the product, its teams and vendedores), so the client you looked for is not
  // hidden behind a fold.
  useEffect(() => {
    if (term) setAbiertos(new Set(grupos.flatMap((g) => [g.ref, ...clavesDeProducto(g.ref, g.equipos)])));
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
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar producto, código, cliente o vendedor…"
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

      {grupos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-10 text-center text-body-md text-on-surface-variant">
          {rows.length === 0
            ? "Todavía no hay ajustes. Aparecen aquí cuando el administrador ajusta una proyección en Comparación."
            : "Ningún ajuste coincide con la búsqueda."}
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
                      {filtroActivo === TODOS ? "Total" : "Ajustado"}
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
                  <div className="border-t border-outline-variant">
                    {g.equipos.map((e) => {
                      const claveE = `${g.ref}${SEP}${e.equipo}`;
                      const abiertoE = abiertos.has(claveE);
                      return (
                        <div key={claveE} className="border-t border-outline-variant first:border-t-0">
                          <button
                            type="button"
                            onClick={() => alternar(claveE)}
                            aria-expanded={abiertoE}
                            className="flex w-full flex-wrap items-center justify-between gap-3 bg-surface-container-low px-4 py-2.5 text-left hover:bg-surface-container-high"
                          >
                            <span className="flex items-center gap-2 text-body-md font-semibold text-on-surface">
                              <span
                                className={`text-on-surface-variant transition-transform ${abiertoE ? "rotate-90" : ""}`}
                                aria-hidden
                              >
                                ›
                              </span>
                              {e.equipo}
                              <span className="text-label-sm font-normal text-on-surface-variant">
                                {e.vendedores.length} vendedor{e.vendedores.length === 1 ? "" : "es"} · {e.clientes} cliente
                                {e.clientes === 1 ? "" : "s"}
                              </span>
                            </span>
                            <span className="text-body-sm font-semibold tabular-nums text-primary">
                              {formatQty(e.total)}
                              <UnitTag unit={g.unidad} />
                            </span>
                          </button>
                          {abiertoE &&
                            e.vendedores.map((v) => {
                              const claveV = `${claveE}${SEP}${v.vendedor}`;
                              const abiertoV = abiertos.has(claveV);
                              return (
                                <div key={claveV} className="border-t border-outline-variant">
                                  <button
                                    type="button"
                                    onClick={() => alternar(claveV)}
                                    aria-expanded={abiertoV}
                                    className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-2 pl-9 text-left hover:bg-surface-container-low"
                                  >
                                    <span className="flex items-center gap-2 text-body-sm font-medium text-on-surface">
                                      <span
                                        className={`text-on-surface-variant transition-transform ${abiertoV ? "rotate-90" : ""}`}
                                        aria-hidden
                                      >
                                        ›
                                      </span>
                                      {v.vendedor}
                                      <span className="text-label-sm font-normal text-on-surface-variant">
                                        {v.clientes} cliente{v.clientes === 1 ? "" : "s"}
                                      </span>
                                    </span>
                                    <span className="text-body-sm font-semibold tabular-nums text-primary">
                                      {formatQty(v.total)}
                                      <UnitTag unit={g.unidad} />
                                    </span>
                                  </button>
                                  {abiertoV && (
                                    <div className="thin-scroll overflow-x-auto border-t border-outline-variant">
                                      <table className="w-full min-w-[640px] border-collapse">
                                        <thead>
                                          <tr className="bg-surface-container-low/60">
                                            <th className="py-1.5 pl-14 pr-3 text-left text-label-sm uppercase tracking-wide text-on-surface-variant">Cliente</th>
                                            <th className="px-3 py-1.5 text-left text-label-sm uppercase tracking-wide text-on-surface-variant">Mes</th>
                                            <th className="px-3 py-1.5 text-right text-label-sm uppercase tracking-wide text-on-surface-variant">Cantidad</th>
                                            <th className="px-3 py-1.5 text-left text-label-sm uppercase tracking-wide text-on-surface-variant">Estado</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {v.items.map((r) => (
                                            <Fila key={r.id} r={r} mesActual={mesActual} />
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      );
                    })}
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

function Fila({ r, mesActual }: { r: Distribucion; mesActual: string }) {
  const estado = estadoDe(r.mes, mesActual);
  return (
    <tr className={`border-t border-outline-variant ${estado === "Vencida" ? "opacity-60" : ""}`}>
      <td className="break-words py-2 pl-14 pr-3 text-body-sm text-on-surface">{r.partner}</td>
      <td className="px-3 py-2 text-body-sm text-on-surface">{periodLabel(r.mes)}</td>
      <td className="px-3 py-2 text-right text-body-sm tabular-nums text-on-surface">
        {formatQty(r.cantidad)}
        <UnitTag unit={r.unidad} />
      </td>
      <td className="px-3 py-2">
        <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-label-sm font-semibold ${TAG[estado]}`}>
          {estado}
        </span>
      </td>
    </tr>
  );
}
