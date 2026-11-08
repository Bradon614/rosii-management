import { CalendarDays, Trash2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface DemandDeleteConfirmationProps {
  clientName: string;
  typeLabel: string;
  requestedDate?: string | null;
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Explicit confirmation before deleting a demand (Feature 20). The demand is
 * identified by its client, type and requested date, and the consequence is
 * stated: the row is kept, only the API view disappears (soft delete).
 */
export function DemandDeleteConfirmation({
  clientName,
  typeLabel,
  requestedDate,
  pending = false,
  error,
  onConfirm,
  onCancel,
}: DemandDeleteConfirmationProps) {
  const reference = requestedDate ? `${typeLabel} du ${requestedDate}` : typeLabel;
  return (
    <Alert
      variant="destructive"
      role="alertdialog"
      aria-label={`Supprimer la demande de ${clientName}`}
    >
      <AlertTitle>Supprimer la demande de « {clientName} » ?</AlertTitle>
      <AlertDescription className="grid gap-3">
        <span>
          La demande ({reference}) sera retirée des listes. La suppression est logique : aucune
          donnée n'est effacée de la base.
        </span>
        {requestedDate ? (
          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
            <CalendarDays className="size-3.5" aria-hidden />
            {requestedDate}
          </span>
        ) : null}
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
              <Trash2 className="animate-pulse" aria-hidden />
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
