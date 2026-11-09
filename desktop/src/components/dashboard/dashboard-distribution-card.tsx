import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DASHBOARD_TONE_BAR,
  DASHBOARD_TONE_DOT,
  type DashboardTone,
} from "@/components/dashboard/dashboard-tone";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface DashboardDistributionItem {
  key: string;
  label: string;
  count: number;
  tone: DashboardTone;
}

interface DashboardDistributionCardProps {
  title: string;
  description: string;
  items: DashboardDistributionItem[];
  total: number;
  href: string;
  emptyLabel?: string;
}

/**
 * Accessible distribution card: every count is written as text, and the bar is
 * only a visual aid (aria-hidden). Counts come from the existing API data; the
 * percentage is a display ratio, not a business rule.
 */
export function DashboardDistributionCard({
  title,
  description,
  items,
  total,
  href,
  emptyLabel = "Aucune donnée enregistrée.",
}: DashboardDistributionCardProps) {
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link to={href}>
              Voir
              <ArrowUpRight aria-hidden />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-muted-foreground text-sm">{emptyLabel}</p>
        ) : (
          <ul className="grid gap-3" aria-label={title}>
            {items.map((item) => {
              const percentage = total > 0 ? Math.round((item.count / total) * 100) : 0;
              return (
                <li key={item.key}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          DASHBOARD_TONE_DOT[item.tone],
                        )}
                        aria-hidden
                      />
                      <span className="truncate text-sm">{item.label}</span>
                    </span>
                    <span className="text-muted-foreground shrink-0 text-sm tabular-nums">
                      {item.count}
                    </span>
                  </div>
                  <div
                    className="bg-muted mt-1.5 h-1.5 overflow-hidden rounded-full"
                    aria-hidden
                  >
                    <div
                      className={cn("h-full rounded-full", DASHBOARD_TONE_BAR[item.tone])}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
