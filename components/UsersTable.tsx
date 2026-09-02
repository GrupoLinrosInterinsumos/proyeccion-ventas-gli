"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { editUserAction, type ActionState } from "@/app/actions";
import { REGIONS, REGION_LABELS } from "@/lib/regions";
import type { UserListRow } from "@/lib/users";
import DeleteUserButton from "./DeleteUserButton";

export default function UsersTable({
  users,
  unclaimedVendedores,
}: {
  users: UserListRow[];
  unclaimedVendedores: string[];
}) {
  const [editingId, setEditingId] = useState<number | null>(null);

  return (
    <div className="thin-scroll overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-outline-variant bg-surface-container-low">
            <th className="px-5 py-2 text-left text-label-md uppercase tracking-wide text-on-surface-variant">
              Nombre
            </th>
            <th className="px-5 py-2 text-left text-label-md uppercase tracking-wide text-on-surface-variant">
              Correo
            </th>
            <th className="px-5 py-2 text-left text-label-md uppercase tracking-wide text-on-surface-variant">
              Vendedor
            </th>
            <th className="px-5 py-2 text-left text-label-md uppercase tracking-wide text-on-surface-variant">
              Región
            </th>
            <th className="px-5 py-2 text-left text-label-md uppercase tracking-wide text-on-surface-variant">
              Rol
            </th>
            <th className="w-32 px-5 py-2" />
          </tr>
        </thead>
        <tbody>
          {users.map((u) =>
            editingId === u.id ? (
              <EditUserRow key={u.id} user={u} unclaimedVendedores={unclaimedVendedores} onClose={() => setEditingId(null)} />
            ) : (
              <tr key={u.id} className="border-b border-outline-variant last:border-b-0 hover:bg-surface-container-low">
                <td className="px-5 py-3 text-body-sm font-medium text-on-surface">{u.name}</td>
                <td className="px-5 py-3 text-body-sm text-on-surface-variant">{u.email}</td>
                <td className="px-5 py-3 text-body-sm text-on-surface-variant">{u.vendedor ?? "—"}</td>
                <td className="px-5 py-3 text-body-sm text-on-surface-variant">
                  {u.region ? REGION_LABELS[u.region] : "—"}
                </td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-1">
                    {u.is_admin && (
                      <span className="rounded bg-secondary-fixed px-1.5 py-0.5 text-label-sm font-medium text-on-secondary-fixed-variant">
                        Administrador
                      </span>
                    )}
                    {u.is_spot && (
                      <span className="rounded bg-tertiary-fixed px-1.5 py-0.5 text-label-sm font-medium text-on-tertiary-fixed-variant">
                        Venta Spot
                      </span>
                    )}
                    {!u.is_admin && !u.is_spot && <span className="text-label-sm text-on-surface-variant">Vendedor</span>}
                  </div>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => setEditingId(u.id)}
                      className="rounded-md px-2 py-1 text-label-sm font-medium text-primary hover:bg-primary-fixed/40"
                    >
                      Editar
                    </button>
                    <DeleteUserButton id={u.id} name={u.name} />
                  </div>
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
}

function EditUserRow({
  user,
  unclaimedVendedores,
  onClose,
}: {
  user: UserListRow;
  unclaimedVendedores: string[];
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(editUserAction, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.success) {
      router.refresh();
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <tr className="border-b border-outline-variant bg-surface-container-low last:border-b-0">
      <td colSpan={6} className="p-4">
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={user.id} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <EditField label="Nombre">
              <input
                name="name"
                required
                defaultValue={user.name}
                className="w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </EditField>
            <EditField label="Correo">
              <input
                name="email"
                type="email"
                required
                defaultValue={user.email}
                className="w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </EditField>
            <EditField label="Vendedor (nombre exacto del Excel)" hint="Vacío solo si es admin sin proyección propia.">
              <input
                name="vendedor"
                list={`unclaimed-vendedores-${user.id}`}
                defaultValue={user.vendedor ?? ""}
                className="w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-sm uppercase outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <datalist id={`unclaimed-vendedores-${user.id}`}>
                {unclaimedVendedores.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </EditField>
            <EditField label="Región">
              <select
                name="region"
                defaultValue={user.region ?? ""}
                className="w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="">Sin región (solo admin)</option>
                {REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {REGION_LABELS[r]}
                  </option>
                ))}
              </select>
            </EditField>
            <EditField label="Nueva contraseña" hint="Déjalo vacío para no cambiarla.">
              <input
                name="password"
                type="text"
                placeholder="Opcional"
                className="w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </EditField>
            <div className="flex flex-col justify-end gap-2 pb-2">
              <div className="flex items-center gap-2">
                <input
                  id={`is_admin-${user.id}`}
                  name="is_admin"
                  type="checkbox"
                  defaultChecked={user.is_admin}
                  className="h-4 w-4 rounded border-outline-variant"
                />
                <label htmlFor={`is_admin-${user.id}`} className="text-body-sm text-on-surface">
                  Es administrador
                </label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id={`is_spot-${user.id}`}
                  name="is_spot"
                  type="checkbox"
                  defaultChecked={user.is_spot}
                  className="h-4 w-4 rounded border-outline-variant"
                />
                <label htmlFor={`is_spot-${user.id}`} className="text-body-sm text-on-surface">
                  Venta Spot
                </label>
              </div>
            </div>
          </div>

          {state?.error && (
            <div className="rounded-md border border-error-container bg-error-container px-3 py-2 text-body-sm text-on-error-container">
              {state.error}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="h-touch rounded-md bg-primary px-4 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Guardando…" : "Guardar cambios"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-touch rounded-md px-3 text-body-sm text-on-surface-variant hover:bg-surface-container-high"
            >
              Cancelar
            </button>
          </div>
        </form>
      </td>
    </tr>
  );
}

function EditField({
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
      <label className="text-label-sm uppercase tracking-wide text-on-surface-variant">{label}</label>
      {children}
      {hint && <p className="text-label-sm text-on-surface-variant">{hint}</p>}
    </div>
  );
}
