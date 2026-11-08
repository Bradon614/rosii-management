import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Native select styled with the design tokens. A native element keeps the
 * platform keyboard behaviour and accessibility (no extra dependency); the
 * application does not need a custom listbox for these forms.
 */
function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "border-input bg-background h-10 w-full min-w-0 appearance-none rounded-md border px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export { Select };
