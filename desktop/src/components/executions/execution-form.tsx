import { useState, type FormEvent } from "react";
import { LoaderCircle, Save } from "lucide-react";

import { DetailItem, DetailList } from "@/components/dossier/detail-list";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  createExecutionForm,
  validateExecutionUpdate,
  EXECUTION_LIMITS,
  type ExecutionFormErrors,
  type ExecutionFormValues,
} from "@/lib/execution-validation";
import {
  executionUpdateErrorMessage,
  type UpdateExecutionPayload,
} from "@/lib/executions-api";
import { formatDate, formatTime } from "@/lib/format";
import type { Execution } from "@/types/api";

interface ExecutionFormProps {
  execution: Execution;
  onSubmit: (payload: UpdateExecutionPayload) => Promise<void>;
  onCancel: () => void;
  /** Offered after a 409 so the patronne can re-read the current version. */
  onReload?: () => void;
}

/**
 * PUT form of one execution (Feature 24), whose editable fields depend on the
 * backend status:
 * - PLANNED: date, start/end times, location and notes;
 * - IN_PROGRESS: location and notes only. The schedule is locked and simply
 *   left out of the request (Feature 32), so no date is re-sent and none is
 *   invented.
 *
 * No date is ever invented: an execution without a scheduled date is displayed
 * as such, and its location/notes can still be corrected while IN_PROGRESS.
 */
export function ExecutionForm({ execution, onSubmit, onCancel, onReload }: ExecutionFormProps) {
  const [values, setValues] = useState<ExecutionFormValues>(() => createExecutionForm(execution));
  const [errors, setErrors] = useState<ExecutionFormErrors>({});
  const [apiError, setApiError] = useState<ApiError | Error | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const inProgress = execution.status === "IN_PROGRESS";

  function update<K extends keyof ExecutionFormValues>(
    field: K,
    value: ExecutionFormValues[K],
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateExecutionUpdate(values, {
      version: execution.version,
      status: execution.status,
    });
    if (!result.payload) {
      setErrors(result.errors);
      setApiError(null);
      return;
    }
    setErrors({});
    setApiError(null);
    setSubmitting(true);
    try {
      await onSubmit(result.payload);
    } catch (cause) {
      setApiError(cause instanceof Error ? cause : new Error("Erreur inattendue"));
    } finally {
      setSubmitting(false);
    }
  }

  const conflict = apiError instanceof ApiError && apiError.status === 409;

  return (
    <form className="grid gap-6" noValidate onSubmit={handleSubmit}>
      {apiError ? (
        <Alert variant="destructive">
          <AlertTitle>Modification impossible</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{executionUpdateErrorMessage(apiError)}</span>
            {conflict && onReload ? (
              <Button type="button" size="sm" variant="outline" onClick={onReload}>
                Recharger l&apos;exécution
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {inProgress ? (
        <div className="grid gap-4">
          <Alert>
            <AlertTitle>Date et horaires verrouillés</AlertTitle>
            <AlertDescription>
              Une exécution « En cours » ne peut plus être replanifiée : sa date et ses horaires
              sont verrouillés par le serveur. Seuls le lieu et les notes sont enregistrés ; la
              date et les horaires ne sont jamais renvoyés ni inventés.
            </AlertDescription>
          </Alert>
          <DetailList>
            <DetailItem
              label="Date programmée"
              value={values.scheduledDate ? formatDate(values.scheduledDate) : "Non renseignée"}
            />
            <DetailItem
              label="Horaires"
              value={
                values.startTime || values.endTime
                  ? `${formatTime(values.startTime)} – ${formatTime(values.endTime)}`
                  : "Non renseignés"
              }
            />
          </DetailList>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="execution-scheduled-date">
              Date programmée <span className="text-destructive">*</span>
            </Label>
            <Input
              id="execution-scheduled-date"
              type="date"
              value={values.scheduledDate}
              onChange={(event) => update("scheduledDate", event.target.value)}
              aria-invalid={Boolean(errors.scheduledDate)}
              aria-describedby={errors.scheduledDate ? "execution-scheduled-date-error" : undefined}
            />
            {errors.scheduledDate ? (
              <p
                id="execution-scheduled-date-error"
                role="alert"
                className="text-destructive text-xs"
              >
                {errors.scheduledDate}
              </p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="execution-start-time">Heure de début</Label>
            <Input
              id="execution-start-time"
              type="time"
              value={values.startTime}
              onChange={(event) => update("startTime", event.target.value)}
              aria-invalid={Boolean(errors.startTime)}
              aria-describedby={errors.startTime ? "execution-start-time-error" : undefined}
            />
            {errors.startTime ? (
              <p id="execution-start-time-error" role="alert" className="text-destructive text-xs">
                {errors.startTime}
              </p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="execution-end-time">Heure de fin</Label>
            <Input
              id="execution-end-time"
              type="time"
              value={values.endTime}
              onChange={(event) => update("endTime", event.target.value)}
              aria-invalid={Boolean(errors.endTime)}
              aria-describedby={errors.endTime ? "execution-end-time-error" : undefined}
            />
            {errors.endTime ? (
              <p id="execution-end-time-error" role="alert" className="text-destructive text-xs">
                {errors.endTime}
              </p>
            ) : null}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="execution-location">Lieu</Label>
            <span className="text-muted-foreground text-xs tabular-nums">
              {values.location.length}/{EXECUTION_LIMITS.location}
            </span>
          </div>
          <Input
            id="execution-location"
            maxLength={EXECUTION_LIMITS.location}
            value={values.location}
            onChange={(event) => update("location", event.target.value)}
            aria-invalid={Boolean(errors.location)}
            aria-describedby={errors.location ? "execution-location-error" : undefined}
            placeholder="Salle, adresse, repère…"
          />
          {errors.location ? (
            <p id="execution-location-error" role="alert" className="text-destructive text-xs">
              {errors.location}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="execution-notes">Notes</Label>
          <span className="text-muted-foreground text-xs tabular-nums">
            {values.notes.length}/{EXECUTION_LIMITS.notes}
          </span>
        </div>
        <Textarea
          id="execution-notes"
          maxLength={EXECUTION_LIMITS.notes}
          value={values.notes}
          onChange={(event) => update("notes", event.target.value)}
          placeholder="Consignes, précisions opérationnelles…"
        />
        {errors.notes ? (
          <p id="execution-notes-error" role="alert" className="text-destructive text-xs">
            {errors.notes}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? <LoaderCircle className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          {submitting
            ? "Enregistrement…"
            : inProgress
              ? "Enregistrer les corrections"
              : "Enregistrer les modifications"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
