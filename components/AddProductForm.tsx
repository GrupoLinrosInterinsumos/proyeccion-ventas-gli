"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addProductAction, type ActionState } from "@/app/actions";
import type { CatalogProduct } from "@/lib/sales";

const inputClass =
  "rounded-md border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-body-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

export default function AddProductForm({
  vendedor,
  catalog,
}: {
  vendedor: string;
  catalog: CatalogProduct[];
}) {
  const [open, setOpen] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [state, formAction, pending] = useActionState<ActionState, FormData>(addProductAction, null);
  const router = useRouter();

  const byCode = useMemo(() => new Map(catalog.map((p) => [p.producto_ref.toUpperCase(), p])), [catalog]);
  const byName = useMemo(() => new Map(catalog.map((p) => [p.producto_nombre.toLowerCase(), p])), [catalog]);

  // Picking a product from either list fills in the other field.
  function onCodigoChange(value: string) {
    setCodigo(value);
    const hit = byCode.get(value.trim().toUpperCase());
    if (hit) setNombre(hit.producto_nombre);
  }
  function onNombreChange(value: string) {
    setNombre(value);
    const hit = byName.get(value.trim().toLowerCase());
    if (hit) setCodigo(hit.producto_ref);
  }

  useEffect(() => {
    if (state?.success) {
      setCodigo("");
      setNombre("");
      setOpen(false);
      router.refresh();
    }
  }, [state, router]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-body-sm font-medium text-primary shadow-sm shadow-black/[0.04] hover:bg-primary-fixed/30"
      >
        <span aria-hidden>+</span> Agregar producto
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-outline-variant bg-surface-container-lowest p-3"
    >
      <input type="hidden" name="vendedor" value={vendedor} />
      <div className="flex flex-col gap-1">
        <label className="text-label-sm text-on-surface-variant">Código</label>
        <input
          name="producto_ref"
          list="catalog-codes"
          value={codigo}
          onChange={(e) => onCodigoChange(e.target.value)}
          placeholder="Ej. GLUC2-067-300"
          autoComplete="off"
          className={`w-44 ${inputClass}`}
        />
        <datalist id="catalog-codes">
          {catalog.map((p) => (
            <option key={p.producto_ref} value={p.producto_ref}>
              {p.producto_nombre}
            </option>
          ))}
        </datalist>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-label-sm text-on-surface-variant">Producto</label>
        <input
          name="producto_nombre"
          list="catalog-names"
          required
          value={nombre}
          onChange={(e) => onNombreChange(e.target.value)}
          placeholder="Busca o escribe el producto"
          autoComplete="off"
          className={`w-72 ${inputClass}`}
        />
        <datalist id="catalog-names">
          {catalog.map((p) => (
            <option key={p.producto_ref} value={p.producto_nombre}>
              {p.producto_ref}
            </option>
          ))}
        </datalist>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-label-sm text-on-surface-variant">Proyección</label>
        <input name="proyeccion" type="number" inputMode="decimal" placeholder="0" className={`w-28 ${inputClass}`} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-label-sm text-on-surface-variant">Observaciones</label>
        <input name="observaciones" placeholder="Opcional" className={`w-48 ${inputClass}`} />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="h-touch rounded-md bg-primary px-4 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Guardando…" : "Guardar"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="h-touch rounded-md px-3 text-body-sm text-on-surface-variant hover:bg-surface-container-high"
      >
        Cancelar
      </button>
      <p className="w-full text-label-sm text-on-surface-variant">
        Elige un producto de la lista para autorrellenar código y nombre. Si no está en la lista, escribe un
        código y nombre nuevos.
      </p>
      {state?.error && <p className="w-full text-body-sm text-secondary">{state.error}</p>}
    </form>
  );
}
