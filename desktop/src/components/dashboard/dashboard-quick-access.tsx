import { Link } from "react-router-dom";
import {
  BadgeCheck,
  CalendarClock,
  ClipboardList,
  Coins,
  FileText,
  Users,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const QUICK_LINKS = [
  { to: "/demandes", label: "Demandes", icon: ClipboardList },
  { to: "/propositions", label: "Propositions", icon: FileText },
  { to: "/executions", label: "Exécutions", icon: CalendarClock },
  { to: "/closures", label: "Clôtures", icon: BadgeCheck },
  { to: "/paiements", label: "Paiements", icon: Coins },
  { to: "/clients", label: "Clients", icon: Users },
] as const;

/** Shortcuts to the existing sections; no new route is introduced here. */
export function DashboardQuickAccess() {
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-base">Accès rapides</CardTitle>
        <CardDescription>Ouvrir directement une section de l&apos;application.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {QUICK_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.to}
                to={link.to}
                className="hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                <Icon className="text-muted-foreground size-4" aria-hidden />
                {link.label}
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
