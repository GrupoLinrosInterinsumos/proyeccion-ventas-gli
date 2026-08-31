"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createUserAction, type ActionState } from "@/app/actions";
import { REGIONS, REGION_LABELS } from "@/lib/regions";

export default function AddUserForm({ unclaimedVendedores }: { unclaimedVendedores: string[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createUserAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state?.success) {
      // Keep the credentials banner visible; only clear the fields on success.
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nombre completo">
          <input
            name="name"
            required
            placeholder="Ej. Jorge Salazar"
            className="w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </Field>
        <Field label="Correo">
          <input
            name="email"
            type="email"
            required
            placeholder="nombre@gli.pe"
            className="w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </Field>
        <Field label="Vendedor (nombre exacto del Excel)" hint="Debe coincidir tal cual con la columna Vendedor del reporte.">
          <input
            name="vendedor"
            required
            list="unclaimed-vendedores"
            placeholder="Ej. JORGE SALAZAR"
            className="w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-sm uppercase outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <datalist id="unclaimed-vendedores">
            {unclaimedVendedores.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </Field>
        <Field label="Región">
          <select
            name="region"
            required
            defaultValue=""
            className="w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="" disabled>
              Selecciona una región
            </option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {REGION_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Contraseña" hint="Déjalo vacío para generar una automáticamente.">
          <input
            name="password"
            type="text"
            placeholder="Opcional"
            className="w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </Field>
        <div className="flex items-center gap-2 self-end pb-2">
          <input id="is_admin" name="is_admin" type="checkbox" className="h-4 w-4 rounded border-outline-variant" />
          <label htmlFor="is_admin" className="text-body-sm text-on-surface">
            Es administrador (dashboard general + importar data)
          </label>
        </div>
      </div>

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
        {pending ? "Creando…" : "Crear usuario"}
      </button>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-label-md uppercase tracking-wide text-on-surface-variant">{label}</label>
      {children}
      {hint && <p className="text-label-sm text-on-surface-variant">{hint}</p>}
    </div>
  );
}
