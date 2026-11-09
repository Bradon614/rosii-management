import { useState, type FormEvent } from "react";
import { BadgeCheck, LoaderCircle, RefreshCw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  CLOSURE_LIMITS,
  CLOSURE_STATUSES,
  createClosureForm,
  validateClosure,
  type ClosureFormErrors,
  type ClosureFormValues,
} from "@/lib/closure-validation";
import {
  closureCreateErrorMessage,
  type CreateClosurePayload,
} from "@/lib/closures-api";
import { closureStatusLabels } from "@/lib/labels";
import type { Preparation } from "@/types/api";

interface ClosureFormProps {
  preparation: Preparation;
  onSubmit: (payload: CreateClosurePayload) => Promise<void>;
  onCancel: () => void;
  /** Offered after a 409 so the patronne can re-read the workflow conditions. */
  onReload?: () => void;
}

/**
 * Creation form of a service closure (Feature 25).
 *
 * The status is chosen explicitly (COMPLETED or WITH_ISSUE), the final notes are
 * optional and empty by default, and `closedAt` is never part of the form: the
 * backend stamps it. A confirmation step happens before the POST, and only one
 * request can be in flight at a time.
 */
export function ClosureForm({ preparation, onSubmit, onCancel, onReload }: ClosureFormProps) {
  const [values, setValues] = useState<ClosureFormValues>(createClosureForm);
  const [errors, setErrors] = useState<ClosureFormErrors>({});
  const [apiError, setApiError] = useState<ApiError | Error | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<CreateClosurePayload | null>(null);

  function update<K extends keyof ClosureFormValues>(
    field: K,
    value: ClosureFormValues[K],
  ) {
    setValues((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => {
      if (!previous[field]) {
        return previous;
      }
      const next = { ...previous };
      delete next[field];
      return next;
    });
    setApiError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateClosure(values, { preparationId: preparation.id });
    if (!result.payload) {
      setErrors(result.errors);
      setApiError(null);
      return;
    }
    setErrors({});
    setApiError(null);
    setPending(result.payload);
  }

  async function confirm() {
    if (!pending || submitting) {
      return;
    }
    setSubmitting(true);
    setApiError(null);
    try {
      await onSubmit(pending);
    } catch (cause) {
      setApiError(cause instanceof Error ? cause : new Error("Erreur inattendue"));
    } finally {
      setSubmitting(false);
    }
  }

  const conflict = apiError instanceof ApiError && apiError.status === 409;

  if (pending) {
    return (
      <Alert role="alertdialog" aria-label="Confirmer la clôture du service">
        <AlertTitle>Clôturer le service — confirmer ?</AlertTitle>
        <AlertDescription className="grid gap-3">
          <span>
            Résultat : <strong>{closureStatusLabels[pending.status]}</strong>. La date de clôture
            sera générée par le serveur et la clôture sera définitive.
          </span>
          {pending.finalNotes ? (
            <span className="whitespace-pre-line">
              Notes finales : {pending.finalNotes}
            </span>
          ) : (
            <span>Aucune note finale.</span>
          )}
          {apiError ? (
            <span className="text-destructive font-medium">
              {closureCreateErrorMessage(apiError)}
            </span>
          ) : null}
          <span className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={confirm} disabled={submitting}>
              {submitting ? (
                <LoaderCircle className="animate-spin" aria-hidden />
              ) : (
                <BadgeCheck aria-hidden />
              )}
              {submitting ? "Clôture…" : "Confirmer la clôture"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setPending(null);
                setApiError(null);
              }}
              disabled={submitting}
            >
              Modifier
            </Button>
            {conflict && onReload ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onReload}
                disabled={submitting}
              >
                <RefreshCw aria-hidden />
                Recharger la préparation
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onCancel}
              disabled={submitting}
            >
              Annuler
            </Button>
          </span>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form className="grid gap-5" noValidate onSubmit={handleSubmit}>
      {apiError ? (
        <Alert variant="destructive">
          <AlertTitle>Clôture impossible</AlertTitle>
          <AlertDescription>{closureCreateErrorMessage(apiError)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="closure-status">
            Résultat de la clôture <span className="text-destructive">*</span>
          </Label>
          <Select
            id="closure-status"
            value={values.status}
            onChange={(event) => update("status", event.target.value as ClosureFormValues["status"])}
            aria-invalid={Boolean(errors.status)}
            aria-describedby={errors.status ? "closure-status-error" : undefined}
          >
            {CLOSURE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {closureStatusLabels[status]}
              </option>
            ))}
          </Select>
          {errors.status ? (
            <p id="closure-status-error" role="alert" className="text-destructive text-xs">
              {errors.status}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="closure-final-notes">Notes finales (facultatif)</Label>
          <span className="text-muted-foreground text-xs tabular-nums">
            {values.finalNotes.length}/{CLOSURE_LIMITS.finalNotes}
          </span>
        </div>
        <Textarea
          id="closure-final-notes"
          maxLength={CLOSURE_LIMITS.finalNotes}
          value={values.finalNotes}
          onChange={(event) => update("finalNotes", event.target.value)}
          aria-invalid={Boolean(errors.finalNotes)}
          aria-describedby={errors.finalNotes ? "closure-final-notes-error" : undefined}
          placeholder="Incident constaté, remarque finale…"
        />
        {errors.finalNotes ? (
          <p id="closure-final-notes-error" role="alert" className="text-destructive text-xs">
            {errors.finalNotes}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit">
          <BadgeCheck aria-hidden />
          Vérifier la clôture
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
