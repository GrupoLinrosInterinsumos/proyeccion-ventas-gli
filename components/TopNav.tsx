import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { initials } from "@/lib/format";
import type { SessionUser } from "@/lib/auth";
import { REGION_LABELS } from "@/lib/regions";
import GliLogo from "./GliLogo";

export default function TopNav({ session, active }: { session: SessionUser; active: string }) {
  const links = [{ href: "/ventas", label: "Mi proyección" }];
  if (session.isAdmin) {
    links.push({ href: "/dashboard", label: "Dashboard general" });
    links.push({ href: "/importar", label: "Importar data" });
  }

  return (
    <header className="border-b border-outline-variant bg-surface-container-lowest">
      <div className="mx-auto flex max-w-container items-center justify-between gap-6 px-margin-mobile py-3 md:px-margin-desktop">
        <div className="flex items-center gap-8">
          <Link href="/ventas">
            <GliLogo height={32} />
          </Link>
          <nav className="flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-md px-3 py-2 text-body-sm font-medium transition-colors ${
                  active === l.href
                    ? "bg-primary-fixed text-on-primary-fixed-variant"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-body-sm font-medium text-on-surface leading-tight">{session.name}</p>
            <p className="text-label-sm uppercase tracking-wide text-on-surface-variant leading-tight">
              {session.isAdmin ? "Administrador" : session.region ? REGION_LABELS[session.region] : ""}
            </p>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-tertiary text-on-tertiary text-label-md">
            {initials(session.name)}
          </span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-md border border-outline-variant px-3 py-2 text-body-sm text-on-surface-variant hover:bg-surface-container-high"
            >
              Salir
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
