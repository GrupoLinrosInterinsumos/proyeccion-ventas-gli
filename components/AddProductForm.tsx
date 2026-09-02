"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addProductAction, type ActionState } from "@/app/actions";

export default function AddProductForm({ vendedor }: { vendedor: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(addProductAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
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
      ref={formRef}
      action={formAction}
      className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-outline-variant bg-surface-container-lowest p-3"
    >
      <input type="hidden" name="vendedor" value={vendedor} />
      <div className="flex flex-col gap-1">
        <label className="text-label-sm text-on-surface-variant">Producto</label>
        <input
          name="producto_nombre"
          required
          placeholder="Nombre del producto"
          className="w-56 rounded-md border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-body-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-label-sm text-on-surface-variant">Proyección</label>
        <input
          name="proyeccion"
          type="number"
          inputMode="decimal"
          placeholder="0"
          className="w-28 rounded-md border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-body-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-label-sm text-on-surface-variant">Observaciones</label>
        <input
          name="observaciones"
          placeholder="Opcional"
          className="w-48 rounded-md border border-outline-variant bg-surface-container-lowest px-2 py-1.5 text-body-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
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
      {state?.error && <p className="w-full text-body-sm text-secondary">{state.error}</p>}
    </form>
  );
}
