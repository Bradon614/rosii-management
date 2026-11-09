import { useState, type ReactNode } from "react";
import { AlertTriangle, LoaderCircle, RefreshCw, Trash2 } from "lucide-react";

import { SectionCard } from "@/components/dossier/section-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ApiError } from "@/lib/api";
import {
  executionDeleteErrorMessage,
  executionsApi,
} from "@/lib/executions-api";
import type { Execution, Preparation, ServiceClosure } from "@/types/api";

interface ExecutionDeleteCardProps {
  execution: Execution;
  /** Preparation context used to name the action and check the closure link. */
  preparation: Preparation | null;
  /** Active closure of the preparation, if any. */
  closure: ServiceClosure | null;
  closureLoading: boolean;
  /** True when the closure link could not be verified (non-404 failure). */
  closureError: ApiError | null;
  /** Called after a successful soft deletion (the page returns to the preparation). */
  onDeleted: () => void;
  /** Reloads the execution context after a conflict or an unverifiable link. */
  onReload: () => void;
}

/**
 * Logical deletion of one execution (Feature 24).
 *
 * F10's DELETE has no backend guard on status or on the F11 closure: the service
 * performs a plain soft deletion. The interface only offers it when the
 * closure link is known and absent, so deleting an execution that a closure
 * depends on cannot silently break the service dossier. When the link cannot
 * be verified, nothing is offered (the same safety rule as the preparation
 * detail). The remaining absence of a backend guard is reported as an anomaly,
 * not hidden behind this interface decision.
 */
export function ExecutionDeleteCard({
  execution,
  preparation,
  closure,
  closureLoading,
  closureError,
  onDeleted,
  onReload,
}: ExecutionDeleteCardProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (deleting || !confirming) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await executionsApi.remove(execution.id);
      setConfirming(false);
      onDeleted();
    } catch (cause) {
      setError(executionDeleteErrorMessage(cause));
    } finally {
      setDeleting(false);
    }
  }

  let content: ReactNode;

  if (closureLoading) {
    content = (
      <div className="grid gap-3" aria-busy="true" aria-live="polite">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  } else if (closureError) {
    content = (
      <Alert variant="warning">
        <AlertTriangle aria-hidden />
        <AlertTitle>Suppression non proposée</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-3">
          <span>
            Le lien avec une clôture n&apos;a pas pu être vérifié. Par sécurité, la suppression
            n&apos;est pas proposée.
          </span>
          <Button type="button" size="sm" variant="outline" onClick={onReload}>
            <RefreshCw aria-hidden />
            Vérifier à nouveau
          </Button>
        </AlertDescription>
      </Alert>
    );
  } else if (closure) {
    content = (
      <Alert variant="warning">
        <AlertTriangle aria-hidden />
        <AlertTitle>Suppression non proposée</AlertTitle>
        <AlertDescription>
          Une clôture est déjà enregistrée pour ce service : supprimer son exécution romprait le
          dossier de service. La suppression n&apos;est donc pas proposée ici.
        </AlertDescription>
      </Alert>
    );
  } else if (!preparation) {
    content = (
      <Alert variant="warning">
        <AlertTriangle aria-hidden />
        <AlertTitle>Suppression non proposée</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-3">
          <span>
            La préparation associée est introuvable : la suppression ne peut pas être proposée
            sans son contexte.
          </span>
          <Button type="button" size="sm" variant="outline" onClick={onReload}>
            <RefreshCw aria-hidden />
            Réessayer
          </Button>
        </AlertDescription>
      </Alert>
    );
  } else {
    content = (
      <div className="grid gap-4">
        <p className="text-muted-foreground text-sm">
          Supprimer cette exécution la retire de l&apos;API tout en conservant la ligne en base
          (suppression logique). La préparation redevient alors sans exécution active ; la
          proposition, ses paiements et ses documents ne sont pas modifiés.
        </p>

        {confirming ? (
          <Alert
            variant="destructive"
            role="alertdialog"
            aria-label={`Supprimer l'exécution de ${preparation.proposalNumber}`}
          >
            <AlertTitle>
              Supprimer l&apos;exécution de {preparation.proposalNumber} ?
            </AlertTitle>
            <AlertDescription className="grid gap-3">
              <span>
                Exécution <span className="font-mono text-xs break-all">{execution.id}</span>.
                Aucune ligne n&apos;est effacée physiquement et aucun document n&apos;est supprimé.
              </span>
              {error ? <span className="font-medium">{error}</span> : null}
              <span className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={remove}
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
                    setError(null);
                  }}
                  disabled={deleting}
                >
                  Annuler
                </Button>
                {error ? (
                  <Button type="button" size="sm" variant="outline" onClick={onReload} disabled={deleting}>
                    <RefreshCw aria-hidden />
                    Recharger
                  </Button>
                ) : null}
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
                setError(null);
                setConfirming(true);
              }}
            >
              <Trash2 aria-hidden />
              Supprimer l&apos;exécution
            </Button>
          </div>
        )}

        {!confirming && error ? (
          <Alert variant="destructive">
            <AlertTitle>Suppression impossible</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>{error}</span>
              <Button type="button" size="sm" variant="outline" onClick={onReload}>
                Recharger l&apos;exécution
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
      </div>
    );
  }

  return (
    <SectionCard
      title="Suppression"
      description="Retrait logique de l'exécution active"
      icon={Trash2}
    >
      {content}
    </SectionCard>
  );
}
