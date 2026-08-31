import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listUsers, getUnclaimedVendedores } from "@/lib/users";
import TopNav from "@/components/TopNav";
import AddUserForm from "@/components/AddUserForm";
import UsersTable from "@/components/UsersTable";

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
          <UsersTable users={users} unclaimedVendedores={unclaimedVendedores} />
        </section>
      </main>
    </div>
  );
}
