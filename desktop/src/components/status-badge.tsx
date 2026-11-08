import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  closureStatusLabels,
  demandStatusLabels,
  executionStatusLabels,
  proposalStatusLabels,
} from "@/lib/labels";
import type {
  ClosureStatus,
  DemandStatus,
  ExecutionStatus,
  ProposalStatus,
} from "@/types/api";

const proposalVariants: Record<ProposalStatus, BadgeVariant> = {
  DRAFT: "secondary",
  SENT: "info",
  ACCEPTED: "success",
  REFUSED: "destructive",
  EXPIRED: "warning",
  CANCELLED: "outline",
};

const demandVariants: Record<DemandStatus, BadgeVariant> = {
  NEW: "info",
  IN_ANALYSIS: "warning",
  PROPOSAL_IN_PREPARATION: "info",
  QUOTE_SENT: "info",
  ACCEPTED: "success",
  REFUSED: "destructive",
  ABANDONED: "outline",
};

const executionVariants: Record<ExecutionStatus, BadgeVariant> = {
  PLANNED: "info",
  IN_PROGRESS: "warning",
  COMPLETED: "success",
  CANCELLED: "outline",
};

const closureVariants: Record<ClosureStatus, BadgeVariant> = {
  COMPLETED: "success",
  WITH_ISSUE: "warning",
};

export function ProposalStatusBadge({ status, className }: { status: ProposalStatus; className?: string }) {
  return (
    <Badge variant={proposalVariants[status]} className={className}>
      {proposalStatusLabels[status]}
    </Badge>
  );
}

export function DemandStatusBadge({ status, className }: { status: DemandStatus; className?: string }) {
  return (
    <Badge variant={demandVariants[status]} className={className}>
      {demandStatusLabels[status]}
    </Badge>
  );
}

export function ExecutionStatusBadge({
  status,
  className,
}: {
  status: ExecutionStatus;
  className?: string;
}) {
  return (
    <Badge variant={executionVariants[status]} className={className}>
      {executionStatusLabels[status]}
    </Badge>
  );
}

export function ClosureStatusBadge({
  status,
  className,
}: {
  status: ClosureStatus;
  className?: string;
}) {
  return (
    <Badge variant={closureVariants[status]} className={className}>
      {closureStatusLabels[status]}
    </Badge>
  );
}

/**
 * The deposit state is the backend's derived `depositReached` flag, displayed
 * as-is: nothing is recomputed from the amounts on this side.
 */
export function DepositBadge({ reached, className }: { reached: boolean; className?: string }) {
  return (
    <Badge variant={reached ? "success" : "warning"} className={cn(className)}>
      {reached ? "Dépôt atteint" : "Dépôt non atteint"}
    </Badge>
  );
}
