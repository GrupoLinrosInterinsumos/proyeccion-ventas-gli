import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listUsers, getUnclaimedVendedores } from "@/lib/users";
import { REGION_LABELS } from "@/lib/regions";
import TopNav from "@/components/TopNav";
import AddUserForm from "@/components/AddUserForm";
import DeleteUserButton from "@/components/DeleteUserButton";

export default async function UsuariosPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.isAdmin) redirect("/ventas");

  const [users, unclaimedVendedores] = await Promise.all([listUsers(), getUnclaimedVendedores()]);

  return (
    <div className="min-h-screen bg-surface-container-low">
      <TopNav session={session} active="/usuarios" />
      <main className="mx-auto max-w-container px-margin-mobile py-8 md:px-margin-desktop">
        <p className="text-label-md uppercase tracking-wide text-on-surface-variant">Acceso al sistema</p>
        <h1 className="text-headline-md text-on-surface">Usuarios</h1>
        <p className="mt-1 max-w-2xl text-body-sm text-on-surface-variant">
          Cada cuenta representa a un vendedor y solo ve su propia proyección. El nombre de
          &quot;Vendedor&quot; debe coincidir exactamente con la columna correspondiente del Excel para
          que sus ventas se vinculen automáticamente.
        </p>

        <section className="mt-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm shadow-black/[0.04]">
          <h2 className="mb-4 text-body-lg font-semibold text-on-surface">Agregar usuario</h2>
          <AddUserForm unclaimedVendedores={unclaimedVendedores} />
        </section>

        <section className="mt-8 rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm shadow-black/[0.04]">
          <h2 className="flex items-center gap-2.5 border-b border-outline-variant px-5 py-3.5 text-body-lg font-semibold text-on-surface">
            <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
            {users.length} cuenta{users.length === 1 ? "" : "s"} activa{users.length === 1 ? "" : "s"}
          </h2>
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
                  <th className="w-24 px-5 py-2" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-outline-variant last:border-b-0 hover:bg-surface-container-low">
                    <td className="px-5 py-3 text-body-sm font-medium text-on-surface">{u.name}</td>
                    <td className="px-5 py-3 text-body-sm text-on-surface-variant">{u.email}</td>
                    <td className="px-5 py-3 text-body-sm text-on-surface-variant">{u.vendedor}</td>
                    <td className="px-5 py-3 text-body-sm text-on-surface-variant">
                      {u.region ? REGION_LABELS[u.region] : "—"}
                    </td>
                    <td className="px-5 py-3">
                      {u.is_admin ? (
                        <span className="rounded bg-secondary-fixed px-1.5 py-0.5 text-label-sm font-medium text-on-secondary-fixed-variant">
                          Administrador
                        </span>
                      ) : (
                        <span className="text-label-sm text-on-surface-variant">Vendedor</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <DeleteUserButton id={u.id} name={u.name} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
