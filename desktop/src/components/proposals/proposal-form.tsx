import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { LoaderCircle, Save } from "lucide-react";

import { DemandSelect } from "@/components/proposals/demand-select";
import { ProposalLinesEditor } from "@/components/proposals/proposal-lines-editor";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useApiQuery } from "@/hooks/use-api-query";
import { ApiError } from "@/lib/api";
import { formatAriary } from "@/lib/format";
import {
  PROPOSAL_LIMITS,
  createEmptyProposalForm,
  estimateProposal,
  validateProposal,
  type ProposalFormErrors,
  type ProposalFormValues,
  type ProposalLineErrors,
} from "@/lib/proposal-validation";
import { proposalErrorMessage, type ProposalPayload } from "@/lib/proposals-api";
import { servicesPath } from "@/lib/services-api";
import type { CatalogueService, Demand } from "@/types/api";

interface ProposalFormProps {
  mode: "create" | "edit";
  initialValues?: ProposalFormValues;
  /** Creation date of the proposal, used by the `validUntil` rule. */
  createdOn: string;
  onSubmit: (payload: ProposalPayload) => Promise<void>;
  onCancel: () => void;
  /** Offered next to a 409 so the patronne can reload instead of overwriting. */
  onReload?: () => void;
}

const TEXTS = {
  create: { submit: "Créer la proposition", submitting: "Création…" },
  edit: { submit: "Enregistrer les modifications", submitting: "Enregistrement…" },
} as const;

/**
 * Create / edit form of a proposal (Feature 21).
 *
 * The number, status, totals and line totals are never produced here: the form
 * only sends the F07 payload (demand, title, validity, deposit, notes, lines)
 * and displays an explicitly *indicative* estimate while editing.
 */
export function ProposalForm({
  mode,
  initialValues,
  createdOn,
  onSubmit,
  onCancel,
  onReload,
}: ProposalFormProps) {
  const [values, setValues] = useState<ProposalFormValues>(
    initialValues ?? createEmptyProposalForm(),
  );
  const [errors, setErrors] = useState<ProposalFormErrors>({});
  const [lineErrors, setLineErrors] = useState<ProposalLineErrors[]>([]);
  const [apiError, setApiError] = useState<ApiError | Error | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: services } = useApiQuery<CatalogueService[]>(servicesPath());
  const catalogue = services ?? [];

  function update<K extends keyof ProposalFormValues>(field: K, value: ProposalFormValues[K]) {
    setValues((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => {
      if (!previous[field as keyof ProposalFormErrors]) {
        return previous;
      }
      const next = { ...previous };
      delete next[field as keyof ProposalFormErrors];
      return next;
    });
    setApiError(null);
  }

  function handleDemandChange(demand: Demand | null) {
    setValues((previous) => ({
      ...previous,
      demandId: demand?.id ?? "",
      clientId: demand?.clientId ?? "",
    }));
    setErrors((previous) => {
      if (!previous.demandId) {
        return previous;
      }
      const next = { ...previous };
      delete next.demandId;
      return next;
    });
    setApiError(null);
  }

  function handleLinesChange(lines: ProposalFormValues["lines"]) {
    setValues((previous) => ({ ...previous, lines }));
    setLineErrors([]);
    setErrors((previous) => {
      if (!previous.lines) {
        return previous;
      }
      const next = { ...previous };
      delete next.lines;
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateProposal(values, { createdOn });
    if (!result.payload) {
      setErrors(result.errors);
      setLineErrors(result.lineErrors);
      setApiError(null);
      return;
    }
    setErrors({});
    setLineErrors([]);
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
  const estimate = estimateProposal(values.lines);

  return (
    <form className="grid gap-8" noValidate onSubmit={handleSubmit}>
      {apiError ? (
        <Alert variant="destructive">
          <AlertTitle>Enregistrement impossible</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{proposalErrorMessage(apiError)}</span>
            {conflict && onReload ? (
              <Button type="button" size="sm" variant="outline" onClick={onReload}>
                Recharger la proposition
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <fieldset className="grid gap-4 border-b pb-8">
        <legend className="mb-3 text-sm font-semibold">Demande</legend>
        <DemandSelect
          value={values.demandId}
          onChange={handleDemandChange}
          invalid={Boolean(errors.demandId)}
          describedBy={errors.demandId ? "proposal-demand-error" : undefined}
        />
        {errors.demandId ? (
          <p id="proposal-demand-error" role="alert" className="text-destructive text-xs">
            {errors.demandId}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="grid gap-4 border-b pb-8">
        <legend className="mb-3 text-sm font-semibold">Informations générales</legend>

        <div className="grid gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="proposal-title">Titre</Label>
            <span className="text-muted-foreground text-xs tabular-nums">
              {values.title.length}/{PROPOSAL_LIMITS.title}
            </span>
          </div>
          <Input
            id="proposal-title"
            maxLength={PROPOSAL_LIMITS.title}
            value={values.title}
            onChange={(event) => update("title", event.target.value)}
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? "proposal-title-error" : undefined}
            placeholder="Mariage Rakoto"
          />
          {errors.title ? (
            <p id="proposal-title-error" role="alert" className="text-destructive text-xs">
              {errors.title}
            </p>
          ) : null}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="proposal-valid-until">Date de validité</Label>
          <Input
            id="proposal-valid-until"
            type="date"
            value={values.validUntil}
            onChange={(event) => update("validUntil", event.target.value)}
            aria-invalid={Boolean(errors.validUntil)}
            aria-describedby="proposal-valid-until-hint"
          />
          {errors.validUntil ? (
            <p id="proposal-valid-until-error" role="alert" className="text-destructive text-xs">
              {errors.validUntil}
            </p>
          ) : (
            <p id="proposal-valid-until-hint" className="text-muted-foreground text-xs">
              Facultative au brouillon, obligatoire pour envoyer la proposition. Elle ne peut pas
              précéder la création.
            </p>
          )}
        </div>

        <div className="grid gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="proposal-notes">Notes</Label>
            <span className="text-muted-foreground text-xs tabular-nums">
              {values.notes.length}/{PROPOSAL_LIMITS.notes}
            </span>
          </div>
          <Textarea
            id="proposal-notes"
            maxLength={PROPOSAL_LIMITS.notes}
            value={values.notes}
            onChange={(event) => update("notes", event.target.value)}
            placeholder="Conditions, remarques…"
          />
          {errors.notes ? (
            <p role="alert" className="text-destructive text-xs">
              {errors.notes}
            </p>
          ) : null}
        </div>
      </fieldset>

      <fieldset className="grid gap-4 border-b pb-8">
        <legend className="mb-3 text-sm font-semibold">Lignes de la proposition</legend>
        <ProposalLinesEditor
          lines={values.lines}
          lineErrors={lineErrors}
          services={catalogue}
          onChange={handleLinesChange}
        />
        {errors.lines ? (
          <p role="alert" className="text-destructive text-xs">
            {errors.lines}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="mb-3 text-sm font-semibold">Dépôt et total</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="proposal-deposit">
              Dépôt demandé (Ar) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="proposal-deposit"
              inputMode="decimal"
              value={values.requiredDeposit}
              onChange={(event) => update("requiredDeposit", event.target.value)}
              aria-invalid={Boolean(errors.requiredDeposit)}
              aria-describedby={
                errors.requiredDeposit ? "proposal-deposit-error" : undefined
              }
              placeholder="200 000"
            />
            {errors.requiredDeposit ? (
              <p id="proposal-deposit-error" role="alert" className="text-destructive text-xs">
                {errors.requiredDeposit}
              </p>
            ) : null}
          </div>

          <div className="bg-muted/30 grid gap-1 rounded-md border px-4 py-3">
            <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Total estimé (indicatif)
            </span>
            <span className="text-xl font-semibold tabular-nums" data-testid="proposal-estimate">
              {formatAriary(estimate.total)}
            </span>
            <span className="text-muted-foreground text-xs">
              Le montant officiel est calculé par le serveur à l'enregistrement.
            </span>
          </div>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? <LoaderCircle className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          {submitting ? TEXTS[mode].submitting : TEXTS[mode].submit}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Annuler
        </Button>
        <Button asChild type="button" variant="link" className="ml-auto">
          <Link to="/propositions">Retour aux propositions</Link>
        </Button>
      </div>
    </form>
  );
}
