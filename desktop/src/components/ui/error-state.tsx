import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/** Full-width error panel used by the pages when a resource cannot be loaded. */
export function ErrorState({ title, description, action, className }: ErrorStateProps) {
  return (
    <Card className={cn("mx-auto w-full max-w-xl items-center px-6 py-10 text-center", className)}>
      <span className="bg-destructive/10 text-destructive flex size-10 items-center justify-center rounded-full">
        <AlertTriangle className="size-5" aria-hidden />
      </span>
      <h2 className="mt-3 text-lg font-semibold">{title}</h2>
      {description ? (
        <p className="text-muted-foreground mt-1 max-w-md text-sm">{description}</p>
      ) : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </Card>
  );
}
