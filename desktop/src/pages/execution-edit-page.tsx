import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Pencil, RefreshCw } from "lucide-react";

import { SectionCard } from "@/components/dossier/section-card";
import { ExecutionForm } from "@/components/executions/execution-form";
import { ExecutionStatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/use-api-query";
import {
  executionErrorMessage,
  executionsApi,
  isExecutionEditable,
  type UpdateExecutionPayload,
} from "@/lib/executions-api";
import { executionStatusLabels } from "@/lib/labels";
import { formatDate } from "@/lib/format";
import type { Execution, Preparation, Proposal } from "@/types/api";

function ExecutionEditSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <Skeleton className="h-5 w-44" />
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

/**
 * Edit page of one execution (Feature 24). The form is only reachable while the
 * backend still allows an update: PLANNED (all operational fields) or
 * IN_PROGRESS (location and notes only). COMPLETED and CANCELLED are terminal
 * and answer 409, so the page explains the refusal instead of rendering a form.
 *
 * An IN_PROGRESS execution without a scheduled date is editable too (Feature
 * 32): the schedule is locked and left out of the PUT, so the location and notes
 * are correctable and no date is ever invented.
 */
export function ExecutionEditPage() {
  const { executionId } = useParams<{ executionId: string }>();
  const navigate = useNavigate();

  const {
    data: execution,
    error,
    loading,
    reload,
  } = useApiQuery<Execution>(executionId ? `/api/executions/${executionId}` : null);
  const { data: preparation, loading: preparationLoading } = useApiQuery<Preparation>(
    execution ? `/api/preparations/${execution.preparationId}` : null,
  );
  const { data: proposal } = useApiQuery<Proposal>(
    preparation ? `/api/proposals/${preparation.proposalId}` : null,
  );

  async function handleSubmit(payload: UpdateExecutionPayload) {
    if (!execution) {
      return;
    }
    await executionsApi.update(execution.id, payload);
    navigate(`/executions/${execution.id}`, {
      state: { flash: "Les informations de l'exécution ont été enregistrées." },
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
    return <ExecutionEditSkeleton />;
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

  if (!isExecutionEditable(execution.status)) {
    return (
      <ErrorState
        title="Modification impossible"
        description={`Cette exécution est « ${executionStatusLabels[execution.status]} ». Ce statut est définitif : ses informations opérationnelles ne peuvent plus être modifiées.`}
        action={
          <Button asChild variant="outline">
            <Link to={`/executions/${execution.id}`}>Retour à l&apos;exécution</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          to={`/executions/${execution.id}`}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Retour à l&apos;exécution
        </Link>
      </div>

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
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Pencil className="text-muted-foreground size-5" aria-hidden />
            {execution.status === "IN_PROGRESS"
              ? "Corriger l'exécution"
              : "Modifier l'exécution"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {execution.scheduledDate
              ? `Date programmée : ${formatDate(execution.scheduledDate)}`
              : "Aucune date programmée"}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to={`/executions/${execution.id}`}>Annuler la modification</Link>
        </Button>
      </header>

      <Alert>
        <AlertTitle>
          {execution.status === "IN_PROGRESS"
            ? "Seuls le lieu et les notes sont modifiables"
            : "Informations opérationnelles modifiables"}
        </AlertTitle>
        <AlertDescription>
          {execution.status === "IN_PROGRESS"
            ? "Une exécution « En cours » ne peut plus être replanifiée : sa date et ses horaires sont verrouillés par le backend. Le lieu et les notes restent corrigeables."
            : "La date programmée est obligatoire. Les heures, le lieu et les notes sont facultatifs ; l'heure de fin ne peut pas précéder l'heure de début."}
        </AlertDescription>
      </Alert>

      <SectionCard
        title="Modification"
        description="Le statut et la version sont vérifiés par le backend"
        icon={Pencil}
      >
        <ExecutionForm
          key={`${execution.id}-${execution.version}-${execution.updatedAt}`}
          execution={execution}
          onSubmit={handleSubmit}
          onCancel={() => navigate(`/executions/${execution.id}`)}
          onReload={reload}
        />
      </SectionCard>

      {preparation ? (
        <p className="text-muted-foreground text-xs">
          Préparation associée :{" "}
          <Link
            to={`/preparations/${preparation.id}`}
            className="hover:underline hover:underline-offset-4"
          >
            ouvrir la préparation
          </Link>
          {proposal ? (
            <>
              {" · "}
              <Link
                to={`/propositions/${proposal.id}`}
                className="hover:underline hover:underline-offset-4"
              >
                ouvrir la proposition {proposal.number}
              </Link>
            </>
          ) : null}
        </p>
      ) : preparationLoading ? (
        <Skeleton className="h-4 w-64" />
      ) : (
        <Alert variant="warning">
          <AlertTriangle aria-hidden />
          <AlertTitle>Contexte indisponible</AlertTitle>
          <AlertDescription>
            La préparation associée n&apos;a pas pu être chargée ; la modification de
            l&apos;exécution reste possible.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
