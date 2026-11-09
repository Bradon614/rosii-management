import { Link, NavLink, Outlet } from "react-router-dom";
import { Building2, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const APP_VERSION = "0.1.0";

/** Main navigation, in business order: clients, demands, proposals, executions, closures, payments. */
const NAV_ITEMS = [
  { to: "/clients", label: "Clients" },
  { to: "/demandes", label: "Demandes" },
  { to: "/propositions", label: "Propositions" },
  { to: "/executions", label: "Exécutions" },
  { to: "/closures", label: "Clôtures" },
  { to: "/paiements", label: "Paiements" },
] as const;

/**
 * Application shell: brand, main navigation, current user and logout.
 * Pages render inside <Outlet />.
 */
export function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2">
            <Link to="/propositions" className="flex items-center gap-2.5">
              <span className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-md">
                <Building2 className="size-5" aria-hidden />
              </span>
              <span className="hidden sm:block">
                <span className="block text-sm leading-tight font-semibold">
                  ROSII Management
                </span>
                <span className="text-muted-foreground block text-xs">Groupe Chez Rosii</span>
              </span>
            </Link>

            <nav
              className="flex min-w-0 flex-wrap items-center gap-1"
              aria-label="Navigation principale"
            >
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "rounded-md px-2 py-1.5 text-sm font-medium whitespace-nowrap transition-colors sm:px-3",
                      isActive
                        ? "bg-secondary text-secondary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            {user ? (
              <span className="text-muted-foreground hidden text-sm md:inline">{user.email}</span>
            ) : null}
            <Button type="button" variant="ghost" size="sm" onClick={logout}>
              <LogOut aria-hidden />
              <span className="hidden sm:inline">Se déconnecter</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>

      <footer className="border-t">
        <div className="text-muted-foreground mx-auto w-full max-w-6xl px-4 py-4 text-xs sm:px-6">
          ROSII Management — v{APP_VERSION} · application de gestion Groupe Chez Rosii
        </div>
      </footer>
    </div>
  );
}
