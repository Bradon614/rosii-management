import { Link } from "react-router-dom";

import { ExecutionStatusBadge } from "@/components/status-badge";
import type { ExecutionStatus } from "@/types/api";

/**
 * Context cells of one closure row (Feature 25).
 *
 * Feature 34: `ClosureResponse` now carries the proposal of the preparation
 * (`proposalId`, `proposalNumber`) and the preparation's active execution
 * (`executionId`, `executionStatus`, both `null` when it has none). The row
 * therefore renders without any per-row read — previously one preparation call
 * and one execution list call per closure. Nothing is invented here: a missing
 * execution is reported as such.
 */
export function ClosurePreparationCell({
  preparationId,
  proposalId,
  proposalNumber,
}: {
  preparationId: string;
  proposalId: string;
  proposalNumber: string;
}) {
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
        to={`/propositions/${proposalId}`}
        aria-label={`Ouvrir la proposition ${proposalNumber}`}
        className="w-fit font-mono text-xs hover:underline hover:underline-offset-4"
      >
        {proposalNumber}
      </Link>
    </div>
  );
}

export function ClosureExecutionCell({
  executionId,
  executionStatus,
}: {
  executionId: string | null;
  executionStatus: ExecutionStatus | null;
}) {
  if (!executionId || !executionStatus) {
    return <span className="text-muted-foreground text-xs">Aucune exécution active</span>;
  }

  return (
    <div className="grid gap-1">
      <ExecutionStatusBadge status={executionStatus} className="w-fit" />
      <Link
        to={`/executions/${executionId}`}
        aria-label={`Ouvrir l'exécution ${executionId}`}
        className="w-fit text-sm hover:underline hover:underline-offset-4"
      >
        Ouvrir l&apos;exécution
      </Link>
    </div>
  );
}
