import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, LoaderCircle, Plus, RefreshCw } from "lucide-react";

import { DetailItem, DetailList } from "@/components/dossier/detail-list";
import { SectionCard } from "@/components/dossier/section-card";
import { ExecutionStatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/use-api-query";
import {
  executionCreateErrorMessage,
  executionsApi,
  executionsPath,
} from "@/lib/executions-api";
import { formatAriary, formatDate, formatTime } from "@/lib/format";
import { proposalStatusLabels } from "@/lib/labels";
import type { Execution, Preparation, Proposal } from "@/types/api";

interface ExecutionManagementCardProps {
  preparation: Preparation;
  /** Called after a successful POST, before the redirect to the detail page. */
  onCreated: (execution: Execution) => void | Promise<void>;
}

/**
 * Execution block of the preparation detail (Feature 24).
 *
 * It displays the active execution when one exists and never offers a second
 * creation. Otherwise it only offers the F10 creation when the backend would
 * accept it: the proposal must be ACCEPTED and its derived `depositReached`
 * flag must be true. Those values come from the proposal DTO and are never
 * recomputed here; the backend remains the final authority (409).
 *
 * The payload is exactly `{ preparationId }`: no date and no status are sent.
 */
export function ExecutionManagementCard({
  preparation,
  onCreated,
}: ExecutionManagementCardProps) {
  const {
    data: executions,
    error: executionsError,
    loading: executionsLoading,
    reload: reloadExecutions,
  } = useApiQuery<Execution[]>(executionsPath({ preparationId: preparation.id }));
  const execution = executions?.[0] ?? null;
  // The proposal is only needed to decide whether a creation is possible: never
  // read it when an active execution already exists, and never invent its state.
  const {
    data: proposal,
    error: proposalError,
    loading: proposalLoading,
    reload: reloadProposal,
  } = useApiQuery<Proposal>(
    execution === null && executions !== null
      ? `/api/proposals/${preparation.proposalId}`
      : null,
  );

  const [confirming, setConfirming] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loading =
    (executionsLoading && executions === null) ||
    (execution === null && proposalLoading && !proposal);
  const loadError = executionsError ?? (execution === null ? proposalError : null);

  function reloadAll() {
    setError(null);
    reloadExecutions();
    reloadProposal();
  }

  async function create() {
    // Only one POST can ever be in flight, even before the disabled state paints.
    if (creating || !confirming) {
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await executionsApi.create({ preparationId: preparation.id });
      setConfirming(false);
      await onCreated(created);
    } catch (cause) {
      setError(executionCreateErrorMessage(cause));
      // The eligibility may have changed (proposal, deposit or concurrent
      // creation): re-read both sources so the section shows the real state.
      reloadExecutions();
      reloadProposal();
    } finally {
      setCreating(false);
    }
  }

  function startCreation() {
    setError(null);
    setConfirming(true);
  }

  function cancelCreation() {
    setConfirming(false);
    setError(null);
  }

  let content: ReactNode;

  if (loading) {
    content = (
      <div className="grid gap-3" aria-busy="true" aria-live="polite">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-2/3" />
      </div>
    );
  } else if (loadError) {
    content = (
      <Alert variant="destructive">
        <AlertTriangle aria-hidden />
        <AlertTitle>Exécution non vérifiable</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-3">
          <span>
            L&apos;état de l&apos;exécution ou les conditions de création n&apos;ont pas pu être
            vérifiés. Par sécurité, aucune création n&apos;est proposée.
          </span>
          <Button type="button" size="sm" variant="outline" onClick={reloadAll}>
            <RefreshCw aria-hidden />
            Réessayer
          </Button>
        </AlertDescription>
      </Alert>
    );
  } else if (execution) {
    content = (
      <div className="grid gap-4">
        <DetailList>
          <DetailItem label="Proposition">
            <Link
              to={`/propositions/${preparation.proposalId}`}
              className="hover:underline hover:underline-offset-4"
            >
              {preparation.proposalNumber}
            </Link>
          </DetailItem>
          <DetailItem label="Statut">
            <ExecutionStatusBadge status={execution.status} />
          </DetailItem>
          <DetailItem
            label="Date programmée"
            value={execution.scheduledDate ? formatDate(execution.scheduledDate) : "Non renseignée"}
          />
          <DetailItem
            label="Horaires"
            value={
              execution.startTime || execution.endTime
                ? `${formatTime(execution.startTime)} – ${formatTime(execution.endTime)}`
                : null
            }
          />
          <DetailItem label="Lieu" value={execution.location} />
        </DetailList>
        <div>
          <Button asChild size="sm">
            <Link to={`/executions/${execution.id}`}>Ouvrir l&apos;exécution</Link>
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          Une exécution active existe déjà pour cette préparation : une seconde création est
          impossible.
        </p>
      </div>
    );
  } else if (!proposal) {
    content = (
      <Alert variant="warning">
        <AlertTriangle aria-hidden />
        <AlertTitle>Création non proposée</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-3">
          <span>La proposition associée n&apos;a pas pu être chargée.</span>
          <Button type="button" size="sm" variant="outline" onClick={reloadAll}>
            <RefreshCw aria-hidden />
            Réessayer
          </Button>
        </AlertDescription>
      </Alert>
    );
  } else if (proposal.status !== "ACCEPTED") {
    content = (
      <EmptyState
        icon={CalendarClock}
        title="Création non disponible"
        description={`Une exécution ne peut être créée que pour une proposition acceptée. Statut actuel : « ${
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
            L&apos;exécution sera disponible dès que le dépôt requis sera atteint. Les montants
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
        <EmptyState
          icon={CalendarClock}
          title="Aucune exécution"
          description="La proposition est acceptée et le dépôt requis est atteint. L'exécution sera créée au statut « Planifiée », sans date inventée."
          action={
            confirming ? null : (
              <Button type="button" size="sm" onClick={startCreation} disabled={creating}>
                <Plus aria-hidden />
                Créer une exécution
              </Button>
            )
          }
        />

        {confirming ? (
          <Alert role="alertdialog" aria-label="Confirmer la création de l'exécution">
            <AlertTitle>
              Créer l&apos;exécution de {preparation.proposalNumber} — confirmer ?
            </AlertTitle>
            <AlertDescription className="grid gap-3">
              <span>
                Une exécution va être créée pour cette préparation, au statut « Planifiée ».
                Aucune date n&apos;est envoyée : elle pourra être renseignée dans le détail de
                l&apos;exécution.
              </span>
              {error ? <span className="text-destructive font-medium">{error}</span> : null}
              <span className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" onClick={create} disabled={creating}>
                  {creating ? (
                    <LoaderCircle className="animate-spin" aria-hidden />
                  ) : (
                    <CalendarClock aria-hidden />
                  )}
                  {creating ? "Création…" : "Confirmer"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={cancelCreation}
                  disabled={creating}
                >
                  Annuler
                </Button>
                {error ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={reloadAll}
                    disabled={creating}
                  >
                    <RefreshCw aria-hidden />
                    Recharger
                  </Button>
                ) : null}
              </span>
            </AlertDescription>
          </Alert>
        ) : null}

        {!confirming && error ? (
          <Alert variant="destructive">
            <AlertTitle>Création impossible</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>{error}</span>
              <Button type="button" size="sm" variant="outline" onClick={reloadAll}>
                Recharger
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
      </div>
    );
  }

  return (
    <SectionCard
      title="Exécution"
      description="Planification opérationnelle de la prestation (F10)"
      icon={CalendarClock}
      action={
        <div className="flex items-center gap-2">
          {execution ? (
            <Link
              to={`/executions/${execution.id}`}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
            >
              <span className="hidden sm:inline">Voir l&apos;exécution</span>
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
            disabled={loading}
            aria-label="Actualiser l'exécution"
          >
            <RefreshCw className={loading ? "animate-spin" : undefined} aria-hidden />
            <span className="hidden sm:inline">Actualiser</span>
          </Button>
        </div>
      }
    >
      {content}
    </SectionCard>
  );
}
