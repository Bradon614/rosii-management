import { useState } from "react";
import { LoaderCircle, RefreshCw, Trash2 } from "lucide-react";

import { SectionCard } from "@/components/dossier/section-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { closureDeleteErrorMessage, closuresApi } from "@/lib/closures-api";
import type { Preparation, ServiceClosure } from "@/types/api";

interface ClosureDeleteCardProps {
  closure: ServiceClosure;
  /** Preparation context used to name the action, when available. */
  preparation: Preparation | null;
  /** Called after a successful soft deletion (the page returns to the preparation). */
  onDeleted: () => void;
  /** Reloads the closure after a conflict. */
  onReload: () => void;
}

/**
 * Logical deletion of one closure (Feature 25).
 *
 * F11 exposes an unconditional soft deletion: the row is kept, the closure
 * leaves the API and the 1:1 slot is released, so a new closure may later be
 * created while the workflow rules still hold. The interface therefore offers
 * the action with an explicit confirmation and never hides a backend guard
 * that does not exist. Nothing is physically deleted.
 */
export function ClosureDeleteCard({
  closure,
  preparation,
  onDeleted,
  onReload,
}: ClosureDeleteCardProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = preparation
    ? `la clôture de ${preparation.proposalNumber}`
    : `la clôture ${closure.id}`;

  async function remove() {
    if (deleting || !confirming) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await closuresApi.remove(closure.id);
      setConfirming(false);
      onDeleted();
    } catch (cause) {
      setError(closureDeleteErrorMessage(cause));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <SectionCard
      title="Suppression"
      description="Retrait logique de la clôture active"
      icon={Trash2}
    >
      <div className="grid gap-4">
        <p className="text-muted-foreground text-sm">
          Supprimer cette clôture la retire de l&apos;API tout en conservant la ligne en base
          (suppression logique). La préparation redevient alors sans clôture active ; la
          proposition, l&apos;exécution, les paiements et les documents ne sont pas modifiés.
        </p>

        {confirming ? (
          <Alert
            variant="destructive"
            role="alertdialog"
            aria-label={`Supprimer ${label}`}
          >
            <AlertTitle>Supprimer {label} ?</AlertTitle>
            <AlertDescription className="grid gap-3">
              <span>
                Identifiant : <span className="font-mono text-xs break-all">{closure.id}</span>.
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
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onReload}
                    disabled={deleting}
                  >
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
              Supprimer la clôture
            </Button>
          </div>
        )}

        {!confirming && error ? (
          <Alert variant="destructive">
            <AlertTitle>Suppression impossible</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>{error}</span>
              <Button type="button" size="sm" variant="outline" onClick={onReload}>
                Recharger la clôture
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
      </div>
    </SectionCard>
  );
}
