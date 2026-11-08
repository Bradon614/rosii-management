import { useState, type FormEvent } from "react";
import { LoaderCircle, Save } from "lucide-react";

import { DepositBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { formatAriary } from "@/lib/format";
import { paymentMethodLabels } from "@/lib/labels";
import {
  PAYMENT_LIMITS,
  createPaymentForm,
  validatePayment,
  type PaymentFormErrors,
  type PaymentFormValues,
} from "@/lib/payment-validation";
import { paymentErrorMessage, type PaymentPayload } from "@/lib/payments-api";
import type { PaymentMethod, Proposal } from "@/types/api";

const PAYMENT_METHODS = Object.keys(paymentMethodLabels) as PaymentMethod[];

interface PaymentFormProps {
  proposal: Proposal;
  onSubmit: (payload: PaymentPayload) => Promise<void>;
  onCancel: () => void;
  /** Offered after a 409 so the patronne can refresh the remaining amount. */
  onReload?: () => void;
}

/**
 * Record a payment (Feature 22). The proposal is given by the navigation
 * context; the remaining amount and the deposit state shown here are the
 * backend values, never a local computation.
 */
export function PaymentForm({ proposal, onSubmit, onCancel, onReload }: PaymentFormProps) {
  const [values, setValues] = useState<PaymentFormValues>(createPaymentForm());
  const [errors, setErrors] = useState<PaymentFormErrors>({});
  const [apiError, setApiError] = useState<ApiError | Error | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof PaymentFormValues>(field: K, value: PaymentFormValues[K]) {
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
    const result = validatePayment(values, {
      proposalId: proposal.id,
      remainingAmount: proposal.remainingAmount,
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
          <AlertTitle>Paiement impossible</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{paymentErrorMessage(apiError)}</span>
            {conflict && onReload ? (
              <Button type="button" size="sm" variant="outline" onClick={onReload}>
                Recharger la proposition
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="bg-muted/30 grid gap-2 rounded-md border px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium">
            {proposal.number}
            {proposal.title ? ` — ${proposal.title}` : ""}
          </span>
          <DepositBadge reached={proposal.depositReached} />
        </div>
        <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span>Total : {formatAriary(proposal.proposalTotal)}</span>
          <span>Déjà payé : {formatAriary(proposal.totalPaid)}</span>
          <span className="text-foreground font-medium">
            Reste à payer : {formatAriary(proposal.remainingAmount)}
          </span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="payment-amount">
            Montant (Ar) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="payment-amount"
            inputMode="decimal"
            value={values.amount}
            onChange={(event) => update("amount", event.target.value)}
            aria-invalid={Boolean(errors.amount)}
            aria-describedby={errors.amount ? "payment-amount-error" : undefined}
            placeholder="150 000"
          />
          {errors.amount ? (
            <p id="payment-amount-error" role="alert" className="text-destructive text-xs">
              {errors.amount}
            </p>
          ) : null}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="payment-method">
            Méthode de paiement <span className="text-destructive">*</span>
          </Label>
          <Select
            id="payment-method"
            value={values.method}
            onChange={(event) => update("method", event.target.value as PaymentMethod | "")}
            aria-invalid={Boolean(errors.method)}
            aria-describedby={errors.method ? "payment-method-error" : undefined}
          >
            <option value="">Choisir une méthode…</option>
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {paymentMethodLabels[method]}
              </option>
            ))}
          </Select>
          {errors.method ? (
            <p id="payment-method-error" role="alert" className="text-destructive text-xs">
              {errors.method}
            </p>
          ) : null}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="payment-date">
            Date du paiement <span className="text-destructive">*</span>
          </Label>
          <Input
            id="payment-date"
            type="date"
            value={values.paymentDate}
            onChange={(event) => update("paymentDate", event.target.value)}
            aria-invalid={Boolean(errors.paymentDate)}
            aria-describedby={errors.paymentDate ? "payment-date-error" : undefined}
          />
          {errors.paymentDate ? (
            <p id="payment-date-error" role="alert" className="text-destructive text-xs">
              {errors.paymentDate}
            </p>
          ) : null}
        </div>

        <div className="grid gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="payment-reference">Référence</Label>
            <span className="text-muted-foreground text-xs tabular-nums">
              {values.reference.length}/{PAYMENT_LIMITS.reference}
            </span>
          </div>
          <Input
            id="payment-reference"
            maxLength={PAYMENT_LIMITS.reference}
            value={values.reference}
            onChange={(event) => update("reference", event.target.value)}
            aria-invalid={Boolean(errors.reference)}
            aria-describedby={errors.reference ? "payment-reference-error" : undefined}
            placeholder="Mvola 42, caisse 1…"
          />
          {errors.reference ? (
            <p id="payment-reference-error" role="alert" className="text-destructive text-xs">
              {errors.reference}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="payment-notes">Notes</Label>
          <span className="text-muted-foreground text-xs tabular-nums">
            {values.notes.length}/{PAYMENT_LIMITS.notes}
          </span>
        </div>
        <Textarea
          id="payment-notes"
          maxLength={PAYMENT_LIMITS.notes}
          value={values.notes}
          onChange={(event) => update("notes", event.target.value)}
          placeholder="Précisions sur l'encaissement…"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? <LoaderCircle className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          {submitting ? "Enregistrement…" : "Enregistrer le paiement"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
