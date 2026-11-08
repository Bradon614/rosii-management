import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ClipboardCheck, LoaderCircle, Plus, RefreshCw } from "lucide-react";

import { DetailItem, DetailList } from "@/components/dossier/detail-list";
import { SectionCard } from "@/components/dossier/section-card";
import { DepositBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { ApiError } from "@/lib/api";
import { formatAriary, formatDateTime } from "@/lib/format";
import { proposalStatusLabels } from "@/lib/labels";
import { preparationCreateErrorMessage, preparationsApi } from "@/lib/preparations-api";
import type { Preparation, Proposal } from "@/types/api";

interface PreparationManagementCardProps {
  proposal: Proposal;
  /** Active preparation of the proposal, or null when there is none. */
  preparation: Preparation | null;
  /** True while `GET /api/preparations?proposalId=` is being read. */
  loading: boolean;
  /**
   * Non-404 read failure. A 404 is not an error here: it is F09's way of saying
   * "no active preparation for this proposal".
   */
  loadError: ApiError | null;
  /** Reloads both the proposal and its preparation link. */
  onReload: () => void;
  /** Called after a successful POST, before the redirect to the detail page. */
  onCreated: (preparation: Preparation) => void | Promise<void>;
}

/**
 * Preparation block of the proposal detail (Feature 23).
 *
 * It only offers what F09 allows, and the backend stays the final authority:
 * - not ACCEPTED: no creation;
 * - ACCEPTED without the required deposit reached: no creation, and the
 *   financial values are the ones returned by the proposal DTO (`depositReached`
 *   is never recomputed here);
 * - ACCEPTED with the deposit reached and no active preparation: explicit
 *   creation after a confirmation;
 * - active preparation: a link to its detail, never a second creation;
 * - soft-deleted preparation: the proposal lookup answers 404, so the block
 *   behaves like "no active preparation" and the backend decides again.
 */
export function PreparationManagementCard({
  proposal,
  preparation,
  loading,
  loadError,
  onReload,
  onCreated,
}: PreparationManagementCardProps) {
  const [confirming, setConfirming] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accepted = proposal.status === "ACCEPTED";

  function startCreation() {
    setError(null);
    setConfirming(true);
  }

  function cancelCreation() {
    setConfirming(false);
    setError(null);
  }

  async function create() {
    // Guards against a double submission (double click / Enter) before the
    // disabled state is painted: only one POST can ever be in flight.
    if (creating || !confirming) {
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await preparationsApi.create({ proposalId: proposal.id });
      setConfirming(false);
      await onCreated(created);
    } catch (cause) {
      setError(preparationCreateErrorMessage(cause));
    } finally {
      setCreating(false);
    }
  }

  let content: ReactNode;

  if (loading) {
    content = (
      <div className="grid gap-3" aria-busy="true" aria-live="polite">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  } else if (loadError) {
    content = (
      <Alert variant="destructive">
        <AlertTitle>Chargement impossible</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-3">
          <span>La préparation de cette proposition n&apos;a pas pu être vérifiée.</span>
          <Button type="button" size="sm" variant="outline" onClick={onReload}>
            <RefreshCw aria-hidden />
            Réessayer
          </Button>
        </AlertDescription>
      </Alert>
    );
  } else if (preparation) {
    content = (
      <>
        <DetailList>
          <DetailItem label="Proposition">
            <Link
              to={`/propositions/${preparation.proposalId}`}
              className="hover:underline hover:underline-offset-4"
            >
              {preparation.proposalNumber}
            </Link>
          </DetailItem>
          <DetailItem label="Ouverte le" value={formatDateTime(preparation.createdAt)} />
          <DetailItem
            label="Dernière mise à jour"
            value={formatDateTime(preparation.updatedAt)}
          />
        </DetailList>
        <p className="text-muted-foreground mt-4 text-sm">
          Une préparation active existe pour cette proposition : une deuxième création est
          impossible. F09 n&apos;expose ni statut, ni planning, ni tâches.
        </p>
      </>
    );
  } else if (!accepted) {
    content = (
      <EmptyState
        icon={ClipboardCheck}
        title="Préparation non disponible"
        description={`La préparation ne peut être créée que pour une proposition acceptée. Statut actuel : « ${
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
            La préparation sera disponible dès que le dépôt requis sera atteint. Les montants
            ci-dessous sont ceux calculés par le backend.
          </AlertDescription>
        </Alert>
        <DetailList>
          <DetailItem label="Dépôt requis" value={formatAriary(proposal.requiredDeposit)} />
          <DetailItem label="Total payé" value={formatAriary(proposal.totalPaid)} />
          <DetailItem label="Reste à payer" value={formatAriary(proposal.remainingAmount)} />
          <DetailItem label="État du dépôt">
            <DepositBadge reached={proposal.depositReached} />
          </DetailItem>
        </DetailList>
      </div>
    );
  } else {
    content = (
      <div className="grid gap-4">
        <EmptyState
          icon={ClipboardCheck}
          title="Aucune préparation active"
          description="La proposition est acceptée et le dépôt requis est atteint. La préparation est ouverte manuellement par la patronne."
          action={
            confirming ? null : (
              <Button type="button" size="sm" onClick={startCreation} disabled={creating}>
                <Plus aria-hidden />
                Créer la préparation
              </Button>
            )
          }
        />

        {confirming ? (
          <Alert>
            <AlertTitle>Créer la préparation — confirmer ?</AlertTitle>
            <AlertDescription className="grid gap-3">
              <span>
                Une préparation va être ouverte pour la proposition {proposal.number}. Une seule
                préparation active est possible par proposition ; elle ne crée ni tâche, ni
                planning, ni réservation.
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" onClick={create} disabled={creating}>
                  {creating ? (
                    <LoaderCircle className="animate-spin" aria-hidden />
                  ) : (
                    <ClipboardCheck aria-hidden />
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
              </span>
            </AlertDescription>
          </Alert>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Création impossible</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>{error}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setError(null);
                  onReload();
                }}
              >
                Recharger la proposition
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
      </div>
    );
  }

  return (
    <SectionCard
      title="Préparation"
      description="Ouverture opérationnelle de la prestation (F09)"
      icon={ClipboardCheck}
      action={
        <div className="flex items-center gap-2">
          {preparation ? (
            <Link
              to={`/preparations/${preparation.id}`}
              aria-label="Ouvrir la préparation"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
            >
              <span className="hidden sm:inline">Ouvrir la préparation</span>
              <span aria-hidden="true" className="sm:hidden">
                Ouvrir
              </span>
            </Link>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onReload}
            disabled={loading}
            aria-label="Actualiser la préparation"
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
