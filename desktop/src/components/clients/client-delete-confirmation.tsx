import { LoaderCircle, Trash2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface ClientDeleteConfirmationProps {
  clientName: string;
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Explicit, in-page confirmation before a soft delete (Feature 19).
 *
 * A destructive action never happens on a single click, and the consequence is
 * spelled out: the client disappears from the API/list but the row is kept
 * (the business rules of Feature 04 only allow soft deletion).
 */
export function ClientDeleteConfirmation({
  clientName,
  pending = false,
  error,
  onConfirm,
  onCancel,
}: ClientDeleteConfirmationProps) {
  return (
    <Alert variant="destructive" role="alertdialog" aria-label={`Supprimer ${clientName}`}>
      <AlertTitle>Supprimer « {clientName} » ?</AlertTitle>
      <AlertDescription className="grid gap-3">
        <span>
          Le client sera retiré des listes et ne sera plus proposé dans les demandes. La suppression
          est logique : aucune donnée n'est effacée de la base.
        </span>
        {error ? <span className="font-medium">{error}</span> : null}
        <span className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? (
              <LoaderCircle className="animate-spin" aria-hidden />
            ) : (
              <Trash2 aria-hidden />
            )}
            {pending ? "Suppression…" : "Confirmer la suppression"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={pending}>
            Annuler
          </Button>
        </span>
      </AlertDescription>
    </Alert>
  );
}
