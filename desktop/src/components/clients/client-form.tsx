import { useState, type FormEvent } from "react";
import { LoaderCircle, Save } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  CLIENT_LIMITS,
  EMPTY_CLIENT_FORM,
  validateClient,
  type ClientFormErrors,
  type ClientFormValues,
  type ClientPayload,
} from "@/lib/client-validation";
import { clientErrorMessage } from "@/lib/clients-api";

interface ClientFormProps {
  mode: "create" | "edit";
  initialValues?: ClientFormValues;
  onSubmit: (payload: ClientPayload) => Promise<void>;
  onCancel: () => void;
  /** Offered next to a 409 so the patronne can reload instead of overwriting. */
  onReload?: () => void;
}

const TEXTS = {
  create: { submit: "Créer le client", submitting: "Création…" },
  edit: { submit: "Enregistrer les modifications", submitting: "Enregistrement…" },
} as const;

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) {
    return null;
  }
  return (
    <p id={id} role="alert" className="text-destructive text-xs">
      {message}
    </p>
  );
}

function Counter({ current, max }: { current: number; max: number }) {
  return (
    <span className="text-muted-foreground text-xs tabular-nums">
      {current}/{max}
    </span>
  );
}

/**
 * Create / edit form for a client (Feature 19).
 *
 * Validation mirrors the backend contract (required name and phone1, the four
 * length limits, email format) and the API stays the authority: a rejected
 * request is never treated as a success.
 */
export function ClientForm({ mode, initialValues, onSubmit, onCancel, onReload }: ClientFormProps) {
  const [values, setValues] = useState<ClientFormValues>(initialValues ?? EMPTY_CLIENT_FORM);
  const [errors, setErrors] = useState<ClientFormErrors>({});
  const [apiError, setApiError] = useState<ApiError | Error | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update(field: keyof ClientFormValues, value: string) {
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
    const result = validateClient(values);
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
    <form className="grid gap-5" noValidate onSubmit={handleSubmit}>
      {apiError ? (
        <Alert variant="destructive">
          <AlertTitle>Enregistrement impossible</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{clientErrorMessage(apiError)}</span>
            {conflict && onReload ? (
              <Button type="button" size="sm" variant="outline" onClick={onReload}>
                Recharger la fiche
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="client-name">
            Nom <span className="text-destructive">*</span>
          </Label>
          <Counter current={values.name.length} max={CLIENT_LIMITS.name} />
        </div>
        <Input
          id="client-name"
          name="name"
          autoComplete="off"
          maxLength={CLIENT_LIMITS.name}
          value={values.name}
          onChange={(event) => update("name", event.target.value)}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? "client-name-error" : undefined}
          placeholder="Alice Rakoto"
        />
        <FieldError id="client-name-error" message={errors.name} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="client-phone1">
              Téléphone principal <span className="text-destructive">*</span>
            </Label>
            <Counter current={values.phone1.length} max={CLIENT_LIMITS.phone} />
          </div>
          <Input
            id="client-phone1"
            name="phone1"
            inputMode="tel"
            maxLength={CLIENT_LIMITS.phone}
            value={values.phone1}
            onChange={(event) => update("phone1", event.target.value)}
            aria-invalid={Boolean(errors.phone1)}
            aria-describedby={errors.phone1 ? "client-phone1-error" : undefined}
            placeholder="+261 34 12 34 56 78"
          />
          <FieldError id="client-phone1-error" message={errors.phone1} />
        </div>

        <div className="grid gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="client-phone2">Téléphone secondaire</Label>
            <Counter current={values.phone2.length} max={CLIENT_LIMITS.phone} />
          </div>
          <Input
            id="client-phone2"
            name="phone2"
            inputMode="tel"
            maxLength={CLIENT_LIMITS.phone}
            value={values.phone2}
            onChange={(event) => update("phone2", event.target.value)}
            aria-invalid={Boolean(errors.phone2)}
            aria-describedby={errors.phone2 ? "client-phone2-error" : undefined}
            placeholder="Facultatif"
          />
          <FieldError id="client-phone2-error" message={errors.phone2} />
        </div>
      </div>

      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="client-email">Email</Label>
          <Counter current={values.email.length} max={CLIENT_LIMITS.email} />
        </div>
        <Input
          id="client-email"
          name="email"
          type="email"
          autoComplete="off"
          maxLength={CLIENT_LIMITS.email}
          value={values.email}
          onChange={(event) => update("email", event.target.value)}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "client-email-error" : undefined}
          placeholder="Facultatif"
        />
        <FieldError id="client-email-error" message={errors.email} />
      </div>

      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="client-notes">Notes</Label>
          <Counter current={values.notes.length} max={CLIENT_LIMITS.notes} />
        </div>
        <Textarea
          id="client-notes"
          name="notes"
          maxLength={CLIENT_LIMITS.notes}
          value={values.notes}
          onChange={(event) => update("notes", event.target.value)}
          aria-invalid={Boolean(errors.notes)}
          aria-describedby={errors.notes ? "client-notes-error" : undefined}
          placeholder="Informations utiles (préférences, remarques…)"
        />
        <FieldError id="client-notes-error" message={errors.notes} />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <Button type="submit" disabled={submitting}>
          {submitting ? <LoaderCircle className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          {submitting ? TEXTS[mode].submitting : TEXTS[mode].submit}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
