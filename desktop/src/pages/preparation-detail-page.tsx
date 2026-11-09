import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  LoaderCircle,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { DetailItem, DetailList } from "@/components/dossier/detail-list";
import { SectionCard } from "@/components/dossier/section-card";
import { ClosureManagementCard } from "@/components/closures/closure-management-card";
import { ExecutionManagementCard } from "@/components/executions/execution-management-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/use-api-query";
import { formatDateTime } from "@/lib/format";
import {
  preparationDeleteErrorMessage,
  preparationErrorMessage,
  preparationsApi,
} from "@/lib/preparations-api";
import type { Execution, Preparation, ServiceClosure } from "@/types/api";

function PreparationDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <Skeleton className="h-5 w-44" />
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

/**
 * Preparation detail (Feature 23). It displays exactly what the F09 DTO exposes
 * — its identifier, its proposal and the audit dates — plus the soft-deletion
 * action. No status, task, planning or progress field is invented: the business
 * rules define none, and the actual execution belongs to Feature 10.
 */
export function PreparationDetailPage() {
  const { preparationId } = useParams<{ preparationId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const flash = (location.state as { flash?: string } | null)?.flash ?? null;

  const { data, error, loading, reload } = useApiQuery<Preparation>(
    preparationId ? `/api/preparations/${preparationId}` : null,
  );
  // A soft delete must never break the F10/F11 chain: before offering it, check
  // whether an execution or a closure is already linked to this preparation.
  const {
    data: executions,
    error: executionsError,
    loading: executionsLoading,
    reload: reloadExecutions,
  } = useApiQuery<Execution[]>(
    data ? `/api/executions?preparationId=${encodeURIComponent(data.id)}` : null,
  );
  const {
    data: closures,
    error: closuresError,
    loading: closuresLoading,
    reload: reloadClosures,
  } = useApiQuery<ServiceClosure[]>(
    data ? `/api/closures?preparationId=${encodeURIComponent(data.id)}` : null,
  );

  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function remove(preparation: Preparation) {
    if (deleting) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await preparationsApi.remove(preparation.id);
      navigate(`/propositions/${preparation.proposalId}`, {
        state: {
          flash:
            "La préparation a été supprimée (suppression logique) : la proposition et les paiements sont conservés.",
        },
      });
    } catch (cause) {
      setDeleteError(preparationDeleteErrorMessage(cause));
    } finally {
      setDeleting(false);
    }
  }

  /** Opens the freshly created execution; the detail page re-reads it from the API. */
  function handleExecutionCreated(created: Execution) {
    navigate(`/executions/${created.id}`, {
      state: { flash: "L'exécution a été créée." },
    });
  }

  /** Opens the freshly created closure; the detail page re-reads it from the API. */
  function handleClosureCreated(created: ServiceClosure) {
    navigate(`/closures/${created.id}`, {
      state: { flash: "Le service a été clôturé." },
    });
  }

  if (!preparationId) {
    return (
      <ErrorState
        title="Préparation introuvable"
        description="Aucun identifiant de préparation n'a été fourni."
        action={
          <Button asChild variant="outline">
            <Link to="/propositions">Retour aux propositions</Link>
          </Button>
        }
      />
    );
  }

  if (loading && !data) {
    return <PreparationDetailSkeleton />;
  }

  if (error) {
    const notFound = error.isNotFound;
    return (
      <ErrorState
        title={notFound ? "Préparation introuvable" : "Chargement impossible"}
        description={
          notFound
            ? "Cette préparation n'existe pas ou a été supprimée."
            : preparationErrorMessage(error)
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
              <Link to="/propositions">Retour aux propositions</Link>
            </Button>
          </>
        }
      />
    );
  }

  if (!data) {
    return null;
  }

  const preparation = data;
  const execution = executions?.[0] ?? null;
  const closure = closures?.[0] ?? null;
  const hasExecution = execution !== null;
  const hasClosure = closure !== null;
  const executionsBusy =
    executionsLoading || (executions === null && executionsError === null);
  const closuresBusy = closuresLoading || (closures === null && closuresError === null);
  // Keep the F23 deletion guard on the original loading contract: it must not
  // change behaviour of the existing preparation screen.
  const relationCheckLoading = executionsLoading || closuresLoading;
  const relationCheckUnavailable = executionsError !== null || closuresError !== null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          to={`/propositions/${preparation.proposalId}`}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Retour à la proposition
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
          <p className="text-muted-foreground font-mono text-sm">{preparation.proposalNumber}</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ClipboardCheck className="text-muted-foreground size-5" aria-hidden />
            Préparation
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Ouverte le {formatDateTime(preparation.createdAt)}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to={`/propositions/${preparation.proposalId}`}>Ouvrir la proposition</Link>
        </Button>
      </header>

      <SectionCard
        title="Préparation"
        description="Ouverture opérationnelle de la prestation"
        icon={ClipboardCheck}
      >
        <DetailList>
          <DetailItem label="Référence">
            <span className="font-mono text-xs break-all">{preparation.id}</span>
          </DetailItem>
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

        <p className="text-muted-foreground mt-4 text-xs">
          Le contrat F09 n&apos;expose ni statut, ni tâche, ni planning : cette fiche affiche
          uniquement les informations réellement enregistrées.
        </p>
      </SectionCard>

      <ExecutionManagementCard
        preparation={preparation}
        onCreated={handleExecutionCreated}
      />

      <ClosureManagementCard
        preparation={preparation}
        execution={execution}
        closure={closure}
        executionLoading={executionsBusy}
        executionError={executionsError}
        closureLoading={closuresBusy}
        closureError={closuresError}
        onReload={() => {
          reloadExecutions();
          reloadClosures();
        }}
        onCreated={handleClosureCreated}
      />

      <SectionCard
        title="Suppression"
        description="Retrait logique de la préparation active"
        icon={Trash2}
      >
        {relationCheckLoading ? (
          <div className="grid gap-3" aria-busy="true">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : relationCheckUnavailable ? (
          <Alert variant="warning">
            <AlertTriangle aria-hidden />
            <AlertTitle>Suppression non proposée</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>
                Le lien avec une exécution ou une clôture n&apos;a pas pu être vérifié. Par
                sécurité, la suppression n&apos;est pas proposée.
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  reloadExecutions();
                  reloadClosures();
                }}
              >
                <RefreshCw aria-hidden />
                Vérifier à nouveau
              </Button>
            </AlertDescription>
          </Alert>
        ) : hasExecution || hasClosure ? (
          <Alert variant="warning">
            <AlertTriangle aria-hidden />
            <AlertTitle>Suppression non proposée</AlertTitle>
            <AlertDescription>
              Une exécution ou une clôture est déjà liée à cette préparation. La supprimer
              romprait le dossier de service (F10/F11) : la suppression n&apos;est pas proposée
              depuis cette interface.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-4">
            <p className="text-muted-foreground text-sm">
              Supprimer cette préparation libère l&apos;emplacement pour une nouvelle préparation.
              La suppression est logique : aucune ligne n&apos;est effacée de la base, et la
              proposition ainsi que ses paiements restent intacts.
            </p>

            {confirming ? (
              <Alert
                variant="destructive"
                role="alertdialog"
                aria-label={`Supprimer la préparation de ${preparation.proposalNumber}`}
              >
                <AlertTitle>
                  Supprimer la préparation de {preparation.proposalNumber} ?
                </AlertTitle>
                <AlertDescription className="grid gap-3">
                  <span>
                    Cette préparation ne sera plus accessible. La proposition, ses paiements et ses
                    documents ne sont pas modifiés.
                  </span>
                  {deleteError ? <span className="font-medium">{deleteError}</span> : null}
                  <span className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => remove(preparation)}
                      disabled={deleting}
                    >
                      {deleting ? (
                        <LoaderCircle className="animate-spin" aria-hidden />
                      ) : (
                        <Trash2 aria-hidden />
                      )}
                      {deleting ? "Suppression…" : "Confirmer la suppression"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setConfirming(false);
                        setDeleteError(null);
                      }}
                      disabled={deleting}
                    >
                      Annuler
                    </Button>
                  </span>
                </AlertDescription>
              </Alert>
            ) : (
              <div>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setDeleteError(null);
                    setConfirming(true);
                  }}
                >
                  <Trash2 aria-hidden />
                  Supprimer la préparation
                </Button>
              </div>
            )}

            {!confirming && deleteError ? (
              <Alert variant="destructive">
                <AlertTitle>Suppression impossible</AlertTitle>
                <AlertDescription className="flex flex-wrap items-center gap-3">
                  <span>{deleteError}</span>
                  <Button type="button" size="sm" variant="outline" onClick={reload}>
                    Recharger la préparation
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
