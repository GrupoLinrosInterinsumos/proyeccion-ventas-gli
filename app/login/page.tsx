import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";
import GliLogo from "@/components/GliLogo";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/ventas");

  return (
    <div className="flex min-h-screen">
      <div className="relative hidden w-[44%] flex-col justify-between overflow-hidden bg-primary px-14 py-16 text-on-primary lg:flex">
        {/* Decorative depth: soft brand-colored glows + a faint dot grid, echoing the mark's crescent/dot motif */}
        <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-tertiary-fixed/20 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute bottom-[-6rem] right-[-4rem] h-80 w-80 rounded-full bg-secondary/25 blur-3xl" aria-hidden />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "linear-gradient(155deg, transparent 40%, rgba(9,12,94,0.55) 100%)" }}
          aria-hidden
        />

        <div className="relative">
          <GliLogo variant="onDark" height={48} />
        </div>

        <div className="relative flex flex-col gap-5">
          <span className="w-fit rounded-full border border-white/15 bg-white/10 px-3 py-1 text-label-sm uppercase tracking-wide text-primary-fixed backdrop-blur-sm">
            Sistema de proyección de ventas
          </span>
          <h1 className="max-w-md text-headline-lg text-on-primary">
            El promedio de tus ventas, siempre a la vista.
          </h1>
          <p className="max-w-sm text-body-md text-primary-fixed/90">
            Consulta el promedio de venta mensual de cada vendedor, define la proyección del mes
            y registra observaciones — todo en un solo lugar.
          </p>
        </div>

        <div className="relative flex flex-wrap gap-2">
          {["Lima", "Arequipa", "Trujillo"].map((r) => (
            <span
              key={r}
              className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-label-sm uppercase tracking-wide text-primary-fixed/90"
            >
              {r}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-surface-container-low px-margin-mobile py-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <GliLogo height={36} />
          </div>
          <h2 className="text-headline-md text-on-surface">Iniciar sesión</h2>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Ingresa con tu correo corporativo para ver tu proyección de ventas.
          </p>
          <div className="relative mt-8 overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-lg shadow-primary/5">
            <div
              className="absolute inset-x-0 top-0 h-1"
              style={{ background: "linear-gradient(90deg, #1d226e, #bb001e)" }}
              aria-hidden
            />
            <LoginForm />
          </div>
        </div>
      </div>
    </div>
  );
}
