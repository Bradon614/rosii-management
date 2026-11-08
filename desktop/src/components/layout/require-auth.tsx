import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";

/** Full-page placeholder while a stored session is verified. */
function SessionLoading() {
  return (
    <div className="flex min-h-screen flex-col" aria-busy="true" aria-live="polite">
      <div className="border-b">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-2.5 px-4 py-3 sm:px-6">
          <Skeleton className="size-9 rounded-md" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-4 py-8 sm:px-6">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

/**
 * Guards every business page: waits for the session check, then either renders
 * the page or redirects to /login while remembering the requested location.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return <SessionLoading />;
  }
  if (status === "anonymous") {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }
  return <>{children}</>;
}
