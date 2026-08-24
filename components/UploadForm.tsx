"use client";

import { useActionState, useRef } from "react";
import { uploadImportAction, type ActionState } from "@/app/actions";

export default function UploadForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    uploadImportAction,
    null
  );
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <label
        htmlFor="file"
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-outline-variant bg-surface-container-low px-6 py-10 text-center transition-colors hover:border-primary hover:bg-primary-fixed/20"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-fixed text-on-primary-fixed-variant text-body-lg">
          ↑
        </span>
        <span className="text-body-md font-medium text-on-surface">
          Arrastra o haz clic para subir el reporte .xlsx
        </span>
        <span className="text-body-sm text-on-surface-variant">
          Hoja &quot;DATA&quot; con columnas Fecha, Vendedor, Equipo Vendedor, Referencia Interna, Producto, Cantidad
        </span>
        <input id="file" name="file" type="file" accept=".xlsx,.xls" required className="hidden" />
      </label>

      {state?.error && (
        <div className="rounded-md border border-error-container bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {state.error}
        </div>
      )}
      {state?.success && (
        <div className="rounded-md border border-outline-variant bg-tertiary-fixed px-3 py-2 text-body-sm text-on-tertiary-fixed-variant">
          {state.success}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="h-touch self-start rounded-md bg-primary px-5 text-body-md font-medium text-on-primary hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Procesando…" : "Subir e importar"}
      </button>
    </form>
  );
}
