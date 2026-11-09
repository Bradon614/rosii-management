import type { ComponentType } from "react";
import { Link } from "react-router-dom";
import {
  BadgeCheck,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Coins,
  FileText,
  History,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DASHBOARD_TONE_ICON,
  type DashboardTone,
} from "@/components/dashboard/dashboard-tone";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DashboardActivity, DashboardActivityKind } from "@/lib/dashboard-data";

const ACTIVITY_STYLES: Record<
  DashboardActivityKind,
  { icon: ComponentType<{ className?: string }>; tone: DashboardTone }
> = {
  demand_created: { icon: ClipboardList, tone: "info" },
  proposal_created: { icon: FileText, tone: "secondary" },
  proposal_accepted: { icon: CheckCircle2, tone: "success" },
  payment_recorded: { icon: Coins, tone: "success" },
  execution_completed: { icon: CalendarCheck, tone: "success" },
  closure_closed: { icon: BadgeCheck, tone: "success" },
};

/**
 * Recent real events, newest first. The list is built only from dates exposed
 * by the APIs; nothing is inferred and no preparation event is invented (there
 * is no global preparation list endpoint).
 */
export function DashboardRecentActivity({
  activities,
}: {
  activities: DashboardActivity[];
}) {
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-base">Activité récente</CardTitle>
        <CardDescription>Derniers événements réellement enregistrés.</CardDescription>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <EmptyState
            icon={History}
            title="Aucune activité"
            description="Aucun événement daté n'est encore enregistré."
          />
        ) : (
          <ul className="grid gap-1" aria-label="Activité récente">
            {activities.map((activity) => {
              const style = ACTIVITY_STYLES[activity.kind];
              const Icon = style.icon;
              return (
                <li key={activity.id}>
                  <Link
                    to={activity.href}
                    className="hover:bg-muted/50 focus-visible:ring-ring -mx-2 flex items-start gap-3 rounded-md px-2 py-2 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-md",
                        DASHBOARD_TONE_ICON[style.tone],
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{activity.title}</span>
                      {activity.reference ? (
                        <span className="text-muted-foreground block truncate text-xs">
                          {activity.reference}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs whitespace-nowrap">
                      {formatDateTime(activity.date)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
