"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { voidCorrectionAction, type ActionState } from "@/app/actions";

export default function VoidCorrectionButton({ id, nombre }: { id: number; nombre: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(voidCorrectionAction, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.success) router.refresh();
  }, [state, router]);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm(`¿Anular la corrección de ${nombre}? Queda en el historial, pero el reporte deja de usarla.`)) e.preventDefault();
      }}
      className="flex flex-col items-end gap-1"
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md px-2 py-1 text-label-sm font-medium text-secondary hover:bg-secondary-fixed disabled:opacity-50"
      >
        {pending ? "…" : "Anular"}
      </button>
      {state?.error && <p className="max-w-[180px] text-right text-label-sm text-secondary">{state.error}</p>}
    </form>
  );
}
