import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  BadgeCheck,
  Plus,
  RefreshCw,
} from "lucide-react";

import { DetailItem, DetailList, DetailNote } from "@/components/dossier/detail-list";
import { SectionCard } from "@/components/dossier/section-card";
import { ClosureForm } from "@/components/closures/closure-form";
import { ClosureStatusBadge, ExecutionStatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/use-api-query";
import { closuresApi } from "@/lib/closures-api";
import { formatAriary, formatDateTime } from "@/lib/format";
import {
  executionStatusLabels,
  proposalStatusLabels,
} from "@/lib/labels";
import type { ApiError } from "@/lib/api";
import type {
  Execution,
  Preparation,
  Proposal,
  ServiceClosure,
} from "@/types/api";

interface ClosureManagementCardProps {
  preparation: Preparation;
  /** Active execution of the preparation, or null when there is none. */
  execution: Execution | null;
  /** Active closure of the preparation, or null when there is none. */
  closure: ServiceClosure | null;
  executionLoading: boolean;
  executionError: ApiError | null;
  closureLoading: boolean;
  closureError: ApiError | null;
  /** Reloads the executions and closures queries owned by the preparation page. */
  onReload: () => void;
  /** Called after a successful POST, before the redirect to the closure detail. */
  onCreated: (closure: ServiceClosure) => void | Promise<void>;
}

/**
 * Closure block of the preparation detail (Feature 25).
 *
 * It only offers the F11 creation when the backend would accept it: an active
 * preparation (the page itself is the active detail), an ACCEPTED proposal, its
 * derived `depositReached` flag, a COMPLETED execution and no active closure.
 * The values come from the existing DTOs and are never recomputed here; the
 * backend remains the final authority (409).
 *
 * The payload is exactly `{ preparationId, status, finalNotes }`: `closedAt` is
 * never sent and the notes are empty by default.
 */
export function ClosureManagementCard({
  preparation,
  execution,
  closure,
  executionLoading,
  executionError,
  closureLoading,
  closureError,
  onReload,
  onCreated,
}: ClosureManagementCardProps) {
  const [creating, setCreating] = useState(false);

  // The proposal is only needed to decide whether a creation is possible.
  const needsProposal = closure === null && execution?.status === "COMPLETED";
  const {
    data: proposal,
    error: proposalError,
    loading: proposalLoading,
    reload: reloadProposal,
  } = useApiQuery<Proposal>(
    needsProposal ? `/api/proposals/${preparation.proposalId}` : null,
  );

  function reloadAll() {
    onReload();
    reloadProposal();
  }

  async function create(payload: Parameters<typeof closuresApi.create>[0]) {
    const created = await closuresApi.create(payload);
    await onCreated(created);
  }

  let content: ReactNode;

  if (closureLoading && closure === null) {
    content = (
      <div className="grid gap-3" aria-busy="true" aria-live="polite">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-2/3" />
      </div>
    );
  } else if (closureError) {
    content = (
      <Alert variant="destructive">
        <AlertTriangle aria-hidden />
        <AlertTitle>Clôture non vérifiable</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-3">
          <span>
            L&apos;état de la clôture n&apos;a pas pu être vérifié. Par sécurité, aucune clôture
            n&apos;est proposée.
          </span>
          <Button type="button" size="sm" variant="outline" onClick={reloadAll}>
            <RefreshCw aria-hidden />
            Réessayer
          </Button>
        </AlertDescription>
      </Alert>
    );
  } else if (closure) {
    content = (
      <div className="grid gap-4">
        <DetailList>
          <DetailItem label="Statut">
            <ClosureStatusBadge status={closure.status} />
          </DetailItem>
          <DetailItem
            label="Clôturée le"
            value={closure.closedAt ? formatDateTime(closure.closedAt) : "Non renseignée"}
          />
          <DetailItem label="Proposition">
            <Link
              to={`/propositions/${preparation.proposalId}`}
              className="hover:underline hover:underline-offset-4"
            >
              {preparation.proposalNumber}
            </Link>
          </DetailItem>
          <DetailItem label="Exécution associée">
            {execution ? (
              <span className="inline-flex flex-wrap items-center gap-2">
                <ExecutionStatusBadge status={execution.status} />
                <Link
                  to={`/executions/${execution.id}`}
                  className="hover:underline hover:underline-offset-4"
                >
                  Ouvrir l&apos;exécution
                </Link>
              </span>
            ) : (
              <span className="text-muted-foreground">Indisponible</span>
            )}
          </DetailItem>
        </DetailList>
        <DetailNote label="Notes finales" value={closure.finalNotes} />
        <div>
          <Button asChild size="sm">
            <Link to={`/closures/${closure.id}`}>Ouvrir la clôture</Link>
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          Une clôture active existe déjà pour cette préparation : une seconde création est
          impossible.
        </p>
      </div>
    );
  } else if (executionLoading && execution === null) {
    content = (
      <div className="grid gap-3" aria-busy="true" aria-live="polite">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-2/3" />
      </div>
    );
  } else if (executionError) {
    content = (
      <Alert variant="destructive">
        <AlertTriangle aria-hidden />
        <AlertTitle>Clôture non vérifiable</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-3">
          <span>
            L&apos;état de l&apos;exécution de cette préparation est indisponible. Par sécurité,
            aucune clôture n&apos;est proposée.
          </span>
          <Button type="button" size="sm" variant="outline" onClick={reloadAll}>
            <RefreshCw aria-hidden />
            Réessayer
          </Button>
        </AlertDescription>
      </Alert>
    );
  } else if (!execution) {
    content = (
      <EmptyState
        icon={BadgeCheck}
        title="Clôture non disponible"
        description="Aucune exécution n'est enregistrée pour cette préparation. La clôture n'est possible qu'après une exécution terminée."
      />
    );
  } else if (execution.status !== "COMPLETED") {
    content = (
      <EmptyState
        icon={BadgeCheck}
        title="Clôture non disponible"
        description={`L'exécution est « ${
          executionStatusLabels[execution.status]
        } ». La clôture n'est possible qu'après le statut « Terminée ».`}
      />
    );
  } else if (proposalLoading && !proposal) {
    content = (
      <div className="grid gap-3" aria-busy="true" aria-live="polite">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-2/3" />
      </div>
    );
  } else if (proposalError) {
    content = (
      <Alert variant="destructive">
        <AlertTriangle aria-hidden />
        <AlertTitle>Clôture non vérifiable</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-3">
          <span>
            Les conditions de la proposition sont indisponibles. Par sécurité, aucune clôture
            n&apos;est proposée.
          </span>
          <Button type="button" size="sm" variant="outline" onClick={reloadAll}>
            <RefreshCw aria-hidden />
            Réessayer
          </Button>
        </AlertDescription>
      </Alert>
    );
  } else if (!proposal) {
    content = (
      <Alert variant="warning">
        <AlertTriangle aria-hidden />
        <AlertTitle>Clôture non proposée</AlertTitle>
        <AlertDescription>La proposition associée n&apos;a pas pu être chargée.</AlertDescription>
      </Alert>
    );
  } else if (proposal.status !== "ACCEPTED") {
    content = (
      <EmptyState
        icon={BadgeCheck}
        title="Clôture non disponible"
        description={`La clôture exige une proposition acceptée. Statut actuel : « ${
          proposalStatusLabels[proposal.status]
        } ».`}
      />
    );
  } else if (!proposal.depositReached) {
    content = (
      <div className="grid gap-4">
        <Alert variant="warning">
          <AlertTitle>Dépôt requis non atteint</AlertTitle>
          <AlertDescription>
            La clôture sera disponible dès que le dépôt requis sera atteint. Les montants
            ci-dessous sont ceux calculés par le backend.
          </AlertDescription>
        </Alert>
        <DetailList>
          <DetailItem label="Dépôt requis" value={formatAriary(proposal.requiredDeposit)} />
          <DetailItem label="Total payé" value={formatAriary(proposal.totalPaid)} />
        </DetailList>
      </div>
    );
  } else {
    content = (
      <div className="grid gap-4">
        {creating ? (
          <ClosureForm
            preparation={preparation}
            onSubmit={create}
            onCancel={() => setCreating(false)}
            onReload={reloadAll}
          />
        ) : (
          <EmptyState
            icon={BadgeCheck}
            title="Aucune clôture"
            description="L'exécution est terminée et les conditions sont réunies. La clôture est un acte explicite de fin de service ; sa date sera générée par le serveur."
            action={
              <Button type="button" size="sm" onClick={() => setCreating(true)}>
                <Plus aria-hidden />
                Clôturer le service
              </Button>
            }
          />
        )}
      </div>
    );
  }

  return (
    <SectionCard
      title="Clôture du service"
      description="Fin officielle de la prestation (F11)"
      icon={BadgeCheck}
      action={
        <div className="flex items-center gap-2">
          {closure ? (
            <Link
              to={`/closures/${closure.id}`}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
            >
              <span className="hidden sm:inline">Voir la clôture</span>
              <span aria-hidden="true" className="sm:hidden">
                Voir
              </span>
            </Link>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={reloadAll}
            disabled={closureLoading || executionLoading}
            aria-label="Actualiser la clôture"
          >
            <RefreshCw
              className={closureLoading || executionLoading ? "animate-spin" : undefined}
              aria-hidden
            />
            <span className="hidden sm:inline">Actualiser</span>
          </Button>
        </div>
      }
    >
      {content}
    </SectionCard>
  );
}
