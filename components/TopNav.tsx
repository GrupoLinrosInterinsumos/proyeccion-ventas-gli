import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { initials } from "@/lib/format";
import type { SessionUser } from "@/lib/auth";
import { REGION_LABELS } from "@/lib/regions";
import GliLogo from "./GliLogo";

export default function TopNav({ session, active }: { session: SessionUser; active: string }) {
  const links: { href: string; label: string }[] = [];
  if (session.vendedor) links.push({ href: "/ventas", label: "Mi proyección" });
  links.push({ href: "/dashboard", label: "Dashboard" });
  if (session.isAdmin) {
    links.push({ href: "/importar", label: "Importar data" });
    links.push({ href: "/usuarios", label: "Usuarios" });
  }
  const homeHref = session.vendedor ? "/ventas" : "/dashboard";

  return (
    <header className="relative overflow-hidden bg-primary shadow-md">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }}
        aria-hidden
      />
      <div className="pointer-events-none absolute -top-16 right-24 h-40 w-40 rounded-full bg-secondary/25 blur-3xl" aria-hidden />

      <div className="relative mx-auto flex max-w-container items-center justify-between gap-6 px-margin-mobile py-3 md:px-margin-desktop">
        <div className="flex items-center gap-8">
          <Link href={homeHref}>
            <GliLogo variant="onDark" height={30} />
          </Link>
          <nav className="flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-md px-3 py-2 text-body-sm font-medium transition-colors ${
                  active === l.href
                    ? "bg-primary-fixed text-on-primary-fixed-variant"
                    : "text-primary-fixed/75 hover:bg-white/10 hover:text-on-primary"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-body-sm font-medium text-on-primary leading-tight">{session.name}</p>
            <p className="text-label-sm uppercase tracking-wide text-primary-fixed/70 leading-tight">
              {session.isSpot ? "Venta Spot" : session.isAdmin ? "Administrador" : ""}
              {session.region ? `${session.isSpot || session.isAdmin ? " · " : ""}${REGION_LABELS[session.region]}` : ""}
            </p>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-on-secondary text-label-md ring-2 ring-white/15">
            {initials(session.name)}
          </span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-md border border-white/20 px-3 py-2 text-body-sm text-primary-fixed/85 transition-colors hover:bg-white/10 hover:text-on-primary"
            >
              Salir
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
