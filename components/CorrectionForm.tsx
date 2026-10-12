"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createCorrectionAction, type ActionState } from "@/app/actions";
import { formatQty } from "@/lib/format";

type Producto = { ref: string; nombre: string; proyectado: number | null };

const inputClass =
  "w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

export default function CorrectionForm({ period, productos }: { period: string; productos: Producto[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createCorrectionAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [producto, setProducto] = useState("");
  const [tipo, setTipo] = useState<"ajuste" | "total">("ajuste");
  const [cantidad, setCantidad] = useState("");

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
      setProducto("");
      setCantidad("");
      router.refresh();
    }
  }, [state, router]);

  const ref = producto.split(" · ")[0].trim().toUpperCase();
  const elegido = productos.find((p) => p.ref === ref);
  const n = Number(cantidad.replace(/,/g, ""));
  const base = elegido?.proyectado ?? 0;
  const resultado = cantidad && Number.isFinite(n) ? (tipo === "total" ? n : Math.max(0, base + n)) : null;

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="period" value={period} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_1fr_1fr]">
        <Field label="Producto" hint="Escribe el nombre o el código y elige de la lista.">
          <input
            name="producto"
            list="productos-corregibles"
            required
            autoComplete="off"
            value={producto}
            onChange={(e) => setProducto(e.target.value)}
            placeholder="Ej. ACIDO ASCORBICO LUWEI"
            className={inputClass}
          />
          <datalist id="productos-corregibles">
            {productos.map((p) => (
              <option key={p.ref} value={`${p.ref} · ${p.nombre}`}>
                {p.proyectado != null ? `Proyectado: ${formatQty(p.proyectado)}` : "Sin proyección"}
              </option>
            ))}
          </datalist>
        </Field>
        <Field label="Tipo">
          <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as "ajuste" | "total")} className={inputClass}>
            <option value="ajuste">Ajuste (+ / −)</option>
            <option value="total">Nueva cantidad del mes</option>
          </select>
        </Field>
        <Field label={tipo === "ajuste" ? "Ajuste" : "Cantidad corregida"} hint={tipo === "ajuste" ? "Negativo si se cayó una venta, p. ej. -3000." : "Reemplaza lo proyectado."}>
          <input
            name="cantidad"
            inputMode="decimal"
            required
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            placeholder={tipo === "ajuste" ? "-3000" : "1500"}
            className={`${inputClass} tabular-nums`}
          />
        </Field>
      </div>
      <Field label="Motivo">
        <input name="motivo" required minLength={3} placeholder="Ej. Cliente X canceló su pedido de noviembre" className={inputClass} />
      </Field>

      {elegido && (
        <p className="text-body-sm text-on-surface-variant">
          Proyectado por los vendedores (sin grupo): <b className="text-on-surface">{elegido.proyectado != null ? formatQty(elegido.proyectado) : "sin proyección"}</b>
          {resultado != null && (
            <>
              {" "}→ el reporte usará <b className="text-on-surface">{formatQty(resultado)}</b>
            </>
          )}
          . Si ya hay otra corrección vigente para este producto, esta se aplica después.
        </p>
      )}

      {state?.error && (
        <div className="rounded-md border border-error-container bg-error-container px-3 py-2 text-body-sm text-on-error-container">{state.error}</div>
      )}
      {state?.success && (
        <div className="rounded-md border border-outline-variant bg-tertiary-fixed px-3 py-2 text-body-sm text-on-tertiary-fixed-variant">{state.success}</div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="h-touch self-start rounded-md bg-primary px-5 text-body-md font-medium text-on-primary hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Guardando…" : "Registrar corrección"}
      </button>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-label-md uppercase tracking-wide text-on-surface-variant">{label}</label>
      {children}
      {hint && <p className="text-label-sm text-on-surface-variant">{hint}</p>}
    </div>
  );
}
