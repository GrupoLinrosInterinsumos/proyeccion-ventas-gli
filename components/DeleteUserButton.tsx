"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { deleteUserAction, type ActionState } from "@/app/actions";

export default function DeleteUserButton({ id, name }: { id: number; name: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(deleteUserAction, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.success) router.refresh();
  }, [state, router]);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm(`¿Eliminar el acceso de ${name}? Esto no borra sus ventas históricas.`)) {
          e.preventDefault();
        }
      }}
      className="flex flex-col items-end gap-1"
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md px-2 py-1 text-label-sm font-medium text-secondary hover:bg-secondary-fixed disabled:opacity-50"
      >
        {pending ? "…" : "Eliminar"}
      </button>
      {state?.error && <p className="max-w-[180px] text-right text-label-sm text-secondary">{state.error}</p>}
    </form>
  );
}
