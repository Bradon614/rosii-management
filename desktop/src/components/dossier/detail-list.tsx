import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

interface DetailItemProps {
  label: string;
  value?: string | number | null;
  children?: ReactNode;
  className?: string;
}

/**
 * One label/value pair of a description list. When neither `children` nor a
 * non-empty `value` is provided the item renders nothing at all, so optional
 * fields (second phone, notes, location...) never appear as empty rows.
 */
export function DetailItem({ label, value, children, className }: DetailItemProps) {
  const hasValue = children !== undefined && children !== null ? true : hasText(value?.toString());
  if (!hasValue) {
    return null;
  }
  return (
    <div className={cn("grid gap-0.5", className)}>
      <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</dt>
      <dd className="text-sm break-words">{children ?? value}</dd>
    </div>
  );
}

export function DetailList({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn("grid gap-4 sm:grid-cols-2", className)}>{children}</dl>;
}

/** Long free text (notes, remarks) with line breaks preserved. */
export function DetailNote({ label, value }: { label: string; value: string | null | undefined }) {
  if (!hasText(value)) {
    return null;
  }
  return (
    <div className="grid gap-0.5 sm:col-span-2">
      <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</dt>
      <dd className="text-sm whitespace-pre-line break-words">{value}</dd>
    </div>
  );
}
