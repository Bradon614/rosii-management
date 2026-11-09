import type { ComponentType } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import {
  DASHBOARD_TONE_ICON,
  type DashboardTone,
} from "@/components/dashboard/dashboard-tone";
import { cn } from "@/lib/utils";

interface DashboardKpiCardProps {
  title: string;
  value: string;
  hint?: string;
  icon: ComponentType<{ className?: string }>;
  href: string;
  tone?: DashboardTone;
  testId?: string;
}

/**
 * One clickable summary card of the dashboard. The value is always a value
 * returned or aggregated from the API; the card never substitutes a fabricated
 * number.
 */
export function DashboardKpiCard({
  title,
  value,
  hint,
  icon: Icon,
  href,
  tone = "default",
  testId,
}: DashboardKpiCardProps) {
  return (
    <Link
      to={href}
      className="group block h-full rounded-lg focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none"
    >
      <Card className="group-hover:border-ring/60 group-hover:bg-muted/20 h-full gap-4 p-5 transition-colors">
        <div className="flex items-start justify-between gap-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-md",
              DASHBOARD_TONE_ICON[tone],
            )}
          >
            <Icon className="size-4" aria-hidden />
          </span>
          <ArrowUpRight
            className="text-muted-foreground size-4 opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        </div>
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {title}
          </p>
          <p
            data-testid={testId}
            className="mt-1 text-2xl font-semibold break-words tabular-nums"
          >
            {value}
          </p>
          {hint ? <p className="text-muted-foreground mt-1 text-xs">{hint}</p> : null}
        </div>
      </Card>
    </Link>
  );
}
