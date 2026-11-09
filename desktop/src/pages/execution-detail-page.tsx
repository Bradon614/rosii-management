import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Pencil,
  RefreshCw,
} from "lucide-react";

import { DetailItem, DetailList, DetailNote } from "@/components/dossier/detail-list";
import { SectionCard } from "@/components/dossier/section-card";
import { ExecutionDeleteCard } from "@/components/executions/execution-delete-card";
import { ExecutionStatusCard } from "@/components/executions/execution-status-card";
import { ExecutionStatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/use-api-query";
import { executionErrorMessage, isExecutionEditable } from "@/lib/executions-api";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import { executionStatusLabels, proposalStatusLabels } from "@/lib/labels";
import type { Execution, Preparation, Proposal, ServiceClosure } from "@/types/api";

function ExecutionDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <Skeleton className="h-5 w-44" />
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-48 w-full" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

/**
 * Execution detail (Feature 24).
 *
 * It displays exactly the fields of the F10 `ExecutionResponse`; absent values
 * are hidden or explicitly labelled "Non renseignée", never invented. The
 * preparation and its proposal are resolved from the existing F09/F07 endpoints
 * so the page can link back to both. Status transitions and the logical
 * deletion use the backend endpoints only.
 */
export function ExecutionDetailPage() {
  const { executionId } = useParams<{ executionId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const flash = (location.state as { flash?: string } | null)?.flash ?? null;

  const {
    data: execution,
    error,
    loading,
    reload,
  } = useApiQuery<Execution>(executionId ? `/api/executions/${executionId}` : null);

  const {
    data: preparation,
    error: preparationError,
    loading: preparationLoading,
  } = useApiQuery<Preparation>(
    execution ? `/api/preparations/${execution.preparationId}` : null,
  );

  const { data: proposal, error: proposalError } = useApiQuery<Proposal>(
    preparation ? `/api/proposals/${preparation.proposalId}` : null,
  );

  const {
    data: closures,
    error: closuresError,
    loading: closuresLoading,
    reload: reloadClosures,
  } = useApiQuery<ServiceClosure[]>(
    preparation
      ? `/api/closures?preparationId=${encodeURIComponent(preparation.id)}`
      : null,
  );

  function reloadAll() {
    reload();
    reloadClosures();
  }

  function handleDeleted() {
    if (!execution) {
      return;
    }
    navigate(`/preparations/${execution.preparationId}`, {
      state: {
        flash:
          "L'exécution a été supprimée (suppression logique) : la préparation redevient sans exécution active.",
      },
    });
  }

  if (!executionId) {
    return (
      <ErrorState
        title="Exécution introuvable"
        description="Aucun identifiant d'exécution n'a été fourni."
        action={
          <Button asChild variant="outline">
            <Link to="/executions">Retour aux exécutions</Link>
          </Button>
        }
      />
    );
  }

  if (loading && !execution) {
    return <ExecutionDetailSkeleton />;
  }

  if (error) {
    const notFound = error.isNotFound;
    return (
      <ErrorState
        title={notFound ? "Exécution introuvable" : "Chargement impossible"}
        description={
          notFound ? "Cette exécution n'existe pas ou a été supprimée." : executionErrorMessage(error)
        }
        action={
          <>
            {!notFound ? (
              <Button type="button" onClick={reload}>
                <RefreshCw aria-hidden />
                Réessayer
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link to="/executions">Retour aux exécutions</Link>
            </Button>
          </>
        }
      />
    );
  }

  if (!execution) {
    return null;
  }

  const editable = isExecutionEditable(execution.status);
  const preparationMissing = preparationError?.isNotFound ?? false;
  const preparationContextError =
    preparationError && !preparationError.isNotFound ? preparationError : null;
  // Between the execution load and the first preparation request, the hook has
  // not started yet: treat that gap as loading so the page never flashes a
  // "preparation introuvable" state.
  const preparationPending = !preparation && !preparationError;
  const preparationBusy = preparationLoading || preparationPending;
  const closure = closures?.[0] ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          to={preparation ? `/preparations/${preparation.id}` : "/executions"}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {preparation ? "Retour à la préparation" : "Retour aux exécutions"}
        </Link>
      </div>

      {flash ? (
        <Alert variant="success">
          <CheckCircle2 aria-hidden />
          <AlertTitle>Opération réussie</AlertTitle>
          <AlertDescription>{flash}</AlertDescription>
        </Alert>
      ) : null}

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {preparation ? (
              <span className="text-muted-foreground font-mono text-sm">
                {preparation.proposalNumber}
              </span>
            ) : null}
            <ExecutionStatusBadge status={execution.status} />
          </div>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight break-words">
            <CalendarClock className="text-muted-foreground size-5" aria-hidden />
            {execution.scheduledDate
              ? `Exécution du ${formatDate(execution.scheduledDate)}`
              : "Exécution"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Créée le {formatDateTime(execution.createdAt)} · dernière mise à jour le{" "}
            {formatDateTime(execution.updatedAt)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {editable ? (
            <Button asChild size="sm" variant="outline">
              <Link to={`/executions/${execution.id}/edit`}>
                <Pencil aria-hidden />
                Modifier l&apos;exécution
              </Link>
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={reloadAll} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : undefined} aria-hidden />
            Actualiser
          </Button>
        </div>
      </header>

      {!editable ? (
        <Alert>
          <AlertTitle>Aucune modification possible</AlertTitle>
          <AlertDescription>
            Cette exécution est « {executionStatusLabels[execution.status]} ». Ce statut est
            définitif : ses informations opérationnelles ne peuvent plus être modifiées.
          </AlertDescription>
        </Alert>
      ) : null}

      <SectionCard
        title="Exécution"
        description="Informations opérationnelles enregistrées"
        icon={FileText}
        action={<ExecutionStatusBadge status={execution.status} />}
      >
        <DetailList>
          <DetailItem label="Identifiant">
            <span className="font-mono text-xs break-all">{execution.id}</span>
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
          <DetailItem
            label="Débutée le"
            value={execution.startedAt ? formatDateTime(execution.startedAt) : null}
          />
          <DetailItem
            label="Terminée le"
            value={execution.completedAt ? formatDateTime(execution.completedAt) : null}
          />
          <DetailItem
            label="Annulée le"
            value={execution.cancelledAt ? formatDateTime(execution.cancelledAt) : null}
          />
          <DetailNote label="Motif d'annulation" value={execution.cancellationReason} />
          <DetailNote label="Notes" value={execution.notes} />
          <DetailItem label="Créée le" value={formatDateTime(execution.createdAt)} />
          <DetailItem
            label="Dernière mise à jour"
            value={formatDateTime(execution.updatedAt)}
          />
          <DetailItem label="Version" value={execution.version} />
        </DetailList>
      </SectionCard>

      <SectionCard
        title="Contexte"
        description="Préparation et proposition associées"
        icon={ClipboardCheck}
      >
        <div className="grid gap-4">
          {preparationMissing ? (
            <Alert variant="warning">
              <AlertTriangle aria-hidden />
              <AlertTitle>Préparation introuvable</AlertTitle>
              <AlertDescription>
                La préparation associée n&apos;existe plus ou a été supprimée. L&apos;exécution
                reste consultable, mais les liens vers la préparation et la proposition ne sont
                plus disponibles.
              </AlertDescription>
            </Alert>
          ) : null}

          {preparationContextError ? (
            <Alert variant="warning">
              <AlertTriangle aria-hidden />
              <AlertTitle>Contexte non vérifiable</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center gap-3">
                <span>La préparation associée n&apos;a pas pu être chargée.</span>
                <Button type="button" size="sm" variant="outline" onClick={reloadAll}>
                  <RefreshCw aria-hidden />
                  Réessayer
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {proposalError && !proposalError.isNotFound ? (
            <Alert variant="warning">
              <AlertTitle>Proposition non vérifiable</AlertTitle>
              <AlertDescription>
                La proposition associée n&apos;a pas pu être chargée : le lien direct vers sa fiche
                n&apos;est pas proposé.
              </AlertDescription>
            </Alert>
          ) : null}

          {preparationBusy && !preparation ? (
            <div className="grid gap-3" aria-busy="true">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <DetailList>
              <DetailItem label="Préparation">
                {preparation ? (
                  <Link
                    to={`/preparations/${preparation.id}`}
                    className="hover:underline hover:underline-offset-4"
                  >
                    Ouvrir la préparation
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Indisponible</span>
                )}
              </DetailItem>
              <DetailItem label="Proposition">
                {preparation ? (
                  proposal ? (
                    <Link
                      to={`/propositions/${proposal.id}`}
                      className="inline-flex items-center gap-1 hover:underline hover:underline-offset-4"
                    >
                      {proposal.number}
                      <ArrowUpRight className="size-3.5" aria-hidden />
                    </Link>
                  ) : (
                    <span className="font-mono text-xs">{preparation.proposalNumber}</span>
                  )
                ) : (
                  <span className="text-muted-foreground">Indisponible</span>
                )}
              </DetailItem>
              {proposal ? (
                <DetailItem
                  label="Statut de la proposition"
                  value={proposalStatusLabels[proposal.status]}
                />
              ) : null}
            </DetailList>
          )}
        </div>
      </SectionCard>

      <ExecutionStatusCard execution={execution} onChanged={reload} />

      <ExecutionDeleteCard
        execution={execution}
        preparation={preparation}
        closure={closure}
        closureLoading={preparationBusy || (Boolean(preparation) && closuresLoading)}
        closureError={preparation ? closuresError : preparationContextError}
        onDeleted={handleDeleted}
        onReload={reloadAll}
      />
    </div>
  );
}
