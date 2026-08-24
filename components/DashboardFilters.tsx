"use client";

import { useRouter } from "next/navigation";
import { REGIONS, REGION_LABELS, type Region } from "@/lib/regions";

export type VendedorOption = { vendedor: string; name: string };

export default function DashboardFilters({
  region,
  vendedor,
  vendedorOptions,
}: {
  region: Region | "";
  vendedor: string;
  vendedorOptions: VendedorOption[];
}) {
  const router = useRouter();

  function go(next: { region?: string; vendedor?: string }) {
    const params = new URLSearchParams();
    const nextRegion = next.region ?? region;
    const nextVendedor = next.vendedor ?? vendedor;
    if (nextRegion) params.set("region", nextRegion);
    if (nextVendedor) params.set("vendedor", nextVendedor);
    router.push(`/dashboard${params.toString() ? `?${params}` : ""}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
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

      {(region || vendedor) && (
        <button
          onClick={() => router.push("/dashboard")}
          className="rounded-md px-3 py-2 text-body-sm text-on-surface-variant hover:bg-surface-container-high"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}
