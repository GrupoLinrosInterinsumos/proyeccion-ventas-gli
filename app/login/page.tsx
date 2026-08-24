import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";
import GliLogo from "@/components/GliLogo";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/ventas");

  return (
    <div className="flex min-h-screen">
      <div className="relative hidden w-[42%] flex-col justify-between bg-primary px-14 py-16 text-on-primary lg:flex">
        <div className="absolute inset-0 bg-gradient-to-br from-tertiary/40 to-transparent" />
        <div className="relative">
          <GliLogo variant="onDark" height={48} />
        </div>
        <div className="relative flex flex-col gap-4">
          <h1 className="text-headline-lg text-on-primary">
            Proyección de ventas, por región.
          </h1>
          <p className="max-w-sm text-body-md text-primary-fixed">
            Consulta el promedio de venta mensual de cada vendedor, define la proyección del mes
            y registra observaciones — todo en un solo lugar.
          </p>
        </div>
        <p className="relative text-label-sm uppercase tracking-wide text-primary-fixed">
          Arequipa · Trujillo · Lima
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-background px-margin-mobile py-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <GliLogo height={36} />
          </div>
          <h2 className="text-headline-md text-on-surface">Iniciar sesión</h2>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Ingresa con tu correo corporativo para ver tu proyección de ventas.
          </p>
          <div className="mt-8 rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
            <LoginForm />
          </div>
        </div>
      </div>
    </div>
  );
}
