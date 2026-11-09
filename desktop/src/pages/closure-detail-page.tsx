import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  CheckCircle2,
  ClipboardCheck,
  RefreshCw,
} from "lucide-react";

import { DetailItem, DetailList, DetailNote } from "@/components/dossier/detail-list";
import { SectionCard } from "@/components/dossier/section-card";
import { ClosureDeleteCard } from "@/components/closures/closure-delete-card";
import { ClosureStatusBadge, ExecutionStatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/use-api-query";
import { closureErrorMessage } from "@/lib/closures-api";
import { formatDateTime } from "@/lib/format";
import type {
  Execution,
  Preparation,
  Proposal,
  ServiceClosure,
} from "@/types/api";

function ClosureDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <Skeleton className="h-5 w-44" />
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-48 w-full" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    </div>
  );
}

/**
 * Closure detail (Feature 25).
 *
 * It displays exactly the fields of the F11 `ClosureResponse`. The preparation,
 * its proposal and its execution are resolved from the existing F09/F10/F07
 * endpoints so the page can link to them. A closure is definitive: there is no
 * edit form and no PUT is ever issued; only the logical deletion is offered.
 */
export function ClosureDetailPage() {
  const { closureId } = useParams<{ closureId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const flash = (location.state as { flash?: string } | null)?.flash ?? null;

  const {
    data: closure,
    error,
    loading,
    reload,
  } = useApiQuery<ServiceClosure>(closureId ? `/api/closures/${closureId}` : null);

  const {
    data: preparation,
    error: preparationError,
    loading: preparationLoading,
    reload: reloadPreparation,
  } = useApiQuery<Preparation>(
    closure ? `/api/preparations/${closure.preparationId}` : null,
  );
  const {
    data: proposal,
    error: proposalError,
    reload: reloadProposal,
  } = useApiQuery<Proposal>(
    preparation ? `/api/proposals/${preparation.proposalId}` : null,
  );
  const {
    data: executions,
    error: executionsError,
    loading: executionsLoading,
    reload: reloadExecutions,
  } = useApiQuery<Execution[]>(
    preparation
      ? `/api/executions?preparationId=${encodeURIComponent(preparation.id)}`
      : null,
  );

  const preparationPending = Boolean(closure) && !preparation && !preparationError;
  const preparationBusy = preparationLoading || preparationPending;
  const executionPending = Boolean(preparation) && executions === null && !executionsError;
  const executionBusy = executionsLoading || executionPending;
  const execution = executions?.[0] ?? null;

  function reloadAll() {
    reload();
    reloadPreparation();
    reloadProposal();
    reloadExecutions();
  }

  function handleDeleted() {
    if (!closure) {
      return;
    }
    navigate(preparation ? `/preparations/${preparation.id}` : "/closures", {
      state: {
        flash:
          "La clôture a été supprimée (suppression logique) : la préparation redevient sans clôture active.",
      },
    });
  }

  if (!closureId) {
    return (
      <ErrorState
        title="Clôture introuvable"
        description="Aucun identifiant de clôture n'a été fourni."
        action={
          <Button asChild variant="outline">
            <Link to="/closures">Retour aux clôtures</Link>
          </Button>
        }
      />
    );
  }

  if (loading && !closure) {
    return <ClosureDetailSkeleton />;
  }

  if (error) {
    const notFound = error.isNotFound;
    return (
      <ErrorState
        title={notFound ? "Clôture introuvable" : "Chargement impossible"}
        description={
          notFound ? "Cette clôture n'existe pas ou a été supprimée." : closureErrorMessage(error)
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
              <Link to="/closures">Retour aux clôtures</Link>
            </Button>
          </>
        }
      />
    );
  }

  if (!closure) {
    return null;
  }

  const preparationMissing = preparationError?.isNotFound ?? false;
  const preparationContextError =
    preparationError && !preparationError.isNotFound ? preparationError : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          to={preparation ? `/preparations/${preparation.id}` : "/closures"}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {preparation ? "Retour à la préparation" : "Retour aux clôtures"}
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
            <ClosureStatusBadge status={closure.status} />
          </div>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight break-words">
            <BadgeCheck className="text-muted-foreground size-5" aria-hidden />
            Clôture du service
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {closure.closedAt
              ? `Clôturée le ${formatDateTime(closure.closedAt)}`
              : "Date de clôture non renseignée"}{" "}
            · dernière mise à jour le {formatDateTime(closure.updatedAt)}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={reloadAll} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : undefined} aria-hidden />
          Actualiser
        </Button>
      </header>

      <Alert>
        <AlertTitle>Clôture définitive</AlertTitle>
        <AlertDescription>
          Une clôture ne peut pas être modifiée après sa création : le statut, les notes finales
          et la date de clôture sont figés. Seule la suppression logique reste possible.
        </AlertDescription>
      </Alert>

      <SectionCard
        title="Clôture"
        description="Fin officielle enregistrée par le serveur"
        icon={BadgeCheck}
        action={<ClosureStatusBadge status={closure.status} />}
      >
        <DetailList>
          <DetailItem label="Identifiant">
            <span className="font-mono text-xs break-all">{closure.id}</span>
          </DetailItem>
          <DetailItem label="Statut">
            <ClosureStatusBadge status={closure.status} />
          </DetailItem>
          <DetailItem
            label="Date de clôture"
            value={closure.closedAt ? formatDateTime(closure.closedAt) : "Non renseignée"}
          />
          <DetailItem label="Créée le" value={formatDateTime(closure.createdAt)} />
          <DetailItem
            label="Dernière mise à jour"
            value={formatDateTime(closure.updatedAt)}
          />
          <DetailItem label="Version" value={closure.version} />
          <DetailNote label="Notes finales" value={closure.finalNotes} />
        </DetailList>
      </SectionCard>

      <SectionCard
        title="Contexte"
        description="Préparation, exécution et proposition associées"
        icon={ClipboardCheck}
      >
        <div className="grid gap-4">
          {preparationMissing ? (
            <Alert variant="warning">
              <AlertTriangle aria-hidden />
              <AlertTitle>Préparation supprimée</AlertTitle>
              <AlertDescription>
                La préparation associée à cette clôture n&apos;existe plus ou a été supprimée.
                La clôture reste consultable, mais les liens vers la préparation et la
                proposition ne sont plus disponibles.
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

          {proposalError ? (
            <Alert variant="warning">
              <AlertTitle>Proposition non vérifiable</AlertTitle>
              <AlertDescription>
                La proposition associée n&apos;a pas pu être chargée : le lien direct vers sa
                fiche n&apos;est pas proposé.
              </AlertDescription>
            </Alert>
          ) : null}

          {executionsError ? (
            <Alert variant="warning">
              <AlertTitle>Exécution non vérifiable</AlertTitle>
              <AlertDescription>
                L&apos;exécution associée n&apos;a pas pu être chargée : le lien direct vers son
                détail n&apos;est pas proposé.
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
              <DetailItem label="Exécution">
                {executionBusy ? (
                  <span className="text-muted-foreground">Chargement…</span>
                ) : execution ? (
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
            </DetailList>
          )}
        </div>
      </SectionCard>

      <ClosureDeleteCard
        closure={closure}
        preparation={preparation}
        onDeleted={handleDeleted}
        onReload={reloadAll}
      />
    </div>
  );
}
