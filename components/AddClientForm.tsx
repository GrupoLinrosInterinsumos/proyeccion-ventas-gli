"use client";

import { useEffect, useRef, useState, useTransition, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { saveClientProjectionAction } from "@/app/actions";

type Hit = { partner: string; propio: boolean; en_lista: boolean };

const inputClass =
  "rounded-md border border-outline-variant bg-surface-container-low px-2 py-1.5 text-body-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

/**
 * Adds a client to a product's projection. Two modes:
 *  - "existente": type to search the clients already in the system and pick one from the list.
 *  - "nuevo": a client that isn't in the system yet — a free name (the server refuses a name that
 *    already exists, pointing to the search instead).
 */
export default function AddClientForm({
  mode,
  vendedor,
  producto_ref,
  producto_nombre,
  period,
  onDone,
  onCancel,
}: {
  mode: "existente" | "nuevo";
  vendedor: string;
  producto_ref: string;
  producto_nombre: string;
  period: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [searching, setSearching] = useState(false);
  const [proyeccion, setProyeccion] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Search the existing clients while typing (debounced); a picked client stops the search.
  useEffect(() => {
    if (mode !== "existente" || picked) return;
    const term = text.trim();
    if (term.length < 2) {
      setHits([]);
      setOpen(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ q: term, vendedor, producto_ref, period });
        const res = await fetch(`/api/clientes?${params}`);
        const data = await res.json();
        if (!cancelled) {
          setHits(data.clientes ?? []);
          setActive(0);
          setOpen(true);
        }
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text, picked, mode, vendedor, producto_ref, period]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function choose(hit: Hit) {
    if (hit.en_lista) return;
    setPicked(hit.partner);
    setText(hit.partner);
    setOpen(false);
    setError(null);
  }

  function onKeyDown(e: ReactKeyboardEvent) {
    if (mode !== "existente" || !open || hits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(hits[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function submit() {
    const partner = mode === "existente" ? picked : text.trim();
    if (!partner) {
      setError(mode === "existente" ? "Busca y elige un cliente de la lista." : "Escribe el nombre del cliente.");
      return;
    }
    const fd = new FormData();
    fd.set("period", period);
    fd.set("vendedor", vendedor);
    fd.set("producto_ref", producto_ref);
    fd.set("producto_nombre", producto_nombre);
    fd.set("partner", partner);
    fd.set("proyeccion", proyeccion);
    fd.set("precio", "");
    fd.set("modo", mode);
    setError(null);
    startTransition(async () => {
      const res = await saveClientProjectionAction(fd);
      if (res?.error) setError(res.error);
      else onDone();
    });
  }

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2 rounded-md border border-dashed border-outline-variant bg-surface-container-lowest p-3">
      <div className="flex flex-col gap-1" ref={boxRef}>
        <label className="text-label-sm text-on-surface-variant">
          {mode === "existente" ? "Cliente existente" : "Cliente nuevo"}
        </label>
        <div className="relative">
          <input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPicked(null);
              setError(null);
            }}
            onFocus={() => hits.length > 0 && !picked && setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={mode === "existente" ? "Escribe para buscar y selecciona…" : "Nombre del cliente nuevo"}
            autoComplete="off"
            autoFocus
            className={`w-72 ${inputClass} ${picked ? "border-primary bg-primary-fixed/30 font-medium" : ""}`}
          />
          {mode === "existente" && open && (
            <ul className="absolute left-0 top-full z-30 mt-1 max-h-64 w-[26rem] max-w-[90vw] overflow-y-auto rounded-md border border-outline-variant bg-surface-container-lowest py-1 shadow-lg shadow-black/10">
              {hits.length === 0 ? (
                <li className="px-3 py-2 text-body-sm text-on-surface-variant">
                  {searching ? "Buscando…" : "Sin coincidencias. Si es un cliente nuevo, usa «Crear cliente»."}
                </li>
              ) : (
                hits.map((h, i) => (
                  <li
                    key={h.partner}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      choose(h);
                    }}
                    className={`flex items-center justify-between gap-3 px-3 py-1.5 text-body-sm ${
                      h.en_lista
                        ? "cursor-not-allowed text-on-surface-variant/60"
                        : `cursor-pointer ${i === active ? "bg-primary-fixed" : "hover:bg-primary-fixed/50"}`
                    }`}
                  >
                    <span className="break-words">{h.partner}</span>
                    <span className="shrink-0 text-label-sm text-on-surface-variant">
                      {h.en_lista ? "ya está en este producto" : h.propio ? "tuyo" : ""}
                    </span>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-label-sm text-on-surface-variant">Proyección</label>
        <input
          type="number"
          inputMode="decimal"
          value={proyeccion}
          onChange={(e) => setProyeccion(e.target.value)}
          placeholder="0"
          className={`w-24 ${inputClass}`}
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
