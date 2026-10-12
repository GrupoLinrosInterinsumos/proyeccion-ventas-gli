"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { flushAll, getSaveState, subscribeSaves, whenSavesIdle } from "@/lib/save-tracker";

/**
 * General save button. Every field already saves itself when you leave it; this flushes anything
 * still pending (or that failed), waits for all saves to finish and refreshes the totals.
 */
export default function SaveAllButton() {
  const router = useRouter();
  const saves = useSyncExternalStore(subscribeSaves, getSaveState, getSaveState);
  const [busy, setBusy] = useState(false);

  async function saveAll() {
    setBusy(true);
    try {
      (document.activeElement as HTMLElement | null)?.blur?.();
      flushAll();
      // Let the saves started above register before waiting for the queue to drain.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await whenSavesIdle();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const saving = busy || saves.pending > 0;
  const lastSaved = saves.lastSavedAt
    ? new Date(saves.lastSavedAt).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="flex items-center gap-2">
      <span
        className={`text-label-sm ${saves.error ? "text-secondary" : "text-on-surface-variant"}`}
        aria-live="polite"
      >
        {saving
          ? "Guardando…"
          : saves.error
            ? "No se pudo guardar — reintenta"
            : lastSaved
              ? `Guardado ${lastSaved}`
              : "Se guarda automáticamente"}
      </span>
      <button
        type="button"
        onClick={saveAll}
        disabled={saving}
        className="rounded-md bg-primary px-3 py-1.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-60"
      >
        Guardar todo
      </button>
    </div>
  );
}
