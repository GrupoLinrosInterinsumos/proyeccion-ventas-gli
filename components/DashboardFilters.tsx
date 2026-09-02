"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { REGIONS, REGION_LABELS, type Region } from "@/lib/regions";

export type VendedorOption = { vendedor: string; name: string };

export default function DashboardFilters({
  region,
  vendedor,
  q,
  categoriaN2,
  period,
  vendedorOptions,
  categoriaN2Options,
}: {
  region: Region | "";
  vendedor: string;
  q: string;
  categoriaN2: string;
  period: string;
  vendedorOptions: VendedorOption[];
  categoriaN2Options: string[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState(q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setSearch(q), [q]);

  function go(next: { region?: string; vendedor?: string; q?: string; categoriaN2?: string }) {
    const params = new URLSearchParams();
    const nextRegion = next.region ?? region;
    const nextVendedor = next.vendedor ?? vendedor;
    const nextQ = next.q ?? q;
    const nextCategoriaN2 = next.categoriaN2 ?? categoriaN2;
    if (period) params.set("period", period);
    if (nextRegion) params.set("region", nextRegion);
    if (nextVendedor) params.set("vendedor", nextVendedor);
    if (nextQ) params.set("q", nextQ);
    if (nextCategoriaN2) params.set("categoriaN2", nextCategoriaN2);
    router.push(`/dashboard${params.toString() ? `?${params}` : ""}`);
  }

  function onSearchChange(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => go({ q: value }), 350);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-on-surface-variant">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
        </span>
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar producto o vendedor…"
          className="w-56 rounded-md border border-outline-variant bg-surface-container-lowest py-2 pl-8 pr-3 text-body-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <select
        value={region}
        onChange={(e) => go({ region: e.target.value, vendedor: "" })}
        className="rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      >
        <option value="">Todas las regiones</option>
        {REGIONS.map((r) => (
          <option key={r} value={r}>
            {REGION_LABELS[r]}
          </option>
        ))}
      </select>

      <select
        value={vendedor}
        onChange={(e) => go({ vendedor: e.target.value })}
        disabled={vendedorOptions.length === 0}
        className="rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
      >
        <option value="">Todos los vendedores</option>
        {vendedorOptions.map((v) => (
          <option key={v.vendedor} value={v.vendedor}>
            {v.name}
          </option>
        ))}
      </select>

      <select
        value={categoriaN2}
        onChange={(e) => go({ categoriaN2: e.target.value })}
        className="rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      >
        <option value="">Todas las categorías</option>
        {categoriaN2Options.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      {(region || vendedor || q || categoriaN2) && (
        <button
          onClick={() => {
            setSearch("");
            router.push(period ? `/dashboard?period=${period}` : "/dashboard");
          }}
          className="rounded-md px-3 py-2 text-body-sm text-on-surface-variant hover:bg-surface-container-high"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}
