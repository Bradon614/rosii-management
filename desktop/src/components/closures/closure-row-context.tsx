import { Link } from "react-router-dom";

import { ExecutionStatusBadge } from "@/components/status-badge";
import { useApiQuery } from "@/hooks/use-api-query";
import type { Execution, Preparation } from "@/types/api";

/**
 * Context cells of one closure row (Feature 25).
 *
 * `ClosureResponse` only exposes `preparationId`; the F09 preparation endpoint
 * adds the proposal number and the F10 execution list gives the associated
 * execution. Each cell makes its own read (identical concurrent GETs are
 * deduplicated by the shared client) and never invents data.
 */
export function ClosurePreparationCell({ preparationId }: { preparationId: string }) {
  const { data: preparation, error, loading } = useApiQuery<Preparation>(
    `/api/preparations/${preparationId}`,
  );

  if (loading && !preparation) {
    return <span className="text-muted-foreground text-xs">Chargement du lien…</span>;
  }
  if (!preparation) {
    return (
      <span className="text-muted-foreground text-xs">
        {error?.isNotFound ? "Préparation supprimée" : "Préparation indisponible"}
      </span>
    );
  }

  return (
    <div className="grid gap-0.5">
      <Link
        to={`/preparations/${preparationId}`}
        aria-label={`Ouvrir la préparation ${preparationId}`}
        className="w-fit text-sm hover:underline hover:underline-offset-4"
      >
        Préparation
      </Link>
      <Link
        to={`/propositions/${preparation.proposalId}`}
        aria-label={`Ouvrir la proposition ${preparation.proposalNumber}`}
        className="w-fit font-mono text-xs hover:underline hover:underline-offset-4"
      >
        {preparation.proposalNumber}
      </Link>
    </div>
  );
}

export function ClosureExecutionCell({ preparationId }: { preparationId: string }) {
  const { data: executions, error, loading } = useApiQuery<Execution[]>(
    `/api/executions?preparationId=${encodeURIComponent(preparationId)}`,
  );
  const execution = executions?.[0] ?? null;

  if (loading && !executions) {
    return <span className="text-muted-foreground text-xs">Chargement du lien…</span>;
  }
  if (!execution) {
    return (
      <span className="text-muted-foreground text-xs">
        {error ? "Exécution indisponible" : "Aucune exécution active"}
      </span>
    );
  }

  return (
    <div className="grid gap-1">
      <ExecutionStatusBadge status={execution.status} className="w-fit" />
      <Link
        to={`/executions/${execution.id}`}
        aria-label={`Ouvrir l'exécution ${execution.id}`}
        className="w-fit text-sm hover:underline hover:underline-offset-4"
      >
        Ouvrir l&apos;exécution
      </Link>
    </div>
  );
}
