"use client";

import { useActionState } from "react";
import { loginAction, type ActionState } from "@/app/actions";

function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 6.5 8.5 6 8.5-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" strokeLinecap="round" />
    </svg>
  );
}

export default function LoginForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(loginAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-label-md uppercase tracking-wide text-on-surface-variant">
          Correo
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-on-surface-variant">
            <MailIcon />
          </span>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="nombre@gli.pe"
            className="w-full rounded-lg border border-outline-variant bg-surface-container-low py-2.5 pl-10 pr-3 text-body-md text-on-surface outline-none transition-all focus:border-primary focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary/15"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-label-md uppercase tracking-wide text-on-surface-variant">
          Contraseña
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-on-surface-variant">
            <LockIcon />
          </span>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            className="w-full rounded-lg border border-outline-variant bg-surface-container-low py-2.5 pl-10 pr-3 text-body-md text-on-surface outline-none transition-all focus:border-primary focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary/15"
          />
        </div>
      </div>

      {state?.error && (
        <div className="rounded-md border border-error-container bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 h-touch rounded-lg text-body-md font-medium text-on-primary shadow-md shadow-primary/20 transition-all hover:shadow-lg hover:shadow-primary/30 disabled:opacity-60"
        style={{ background: "linear-gradient(135deg, #23265b, #1d226e)" }}
      >
        {pending ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
