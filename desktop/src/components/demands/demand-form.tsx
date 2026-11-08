import { useState, type FormEvent, type ReactNode } from "react";
import { LoaderCircle, Save } from "lucide-react";

import { ClientSelect } from "@/components/demands/client-select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  DEMAND_LIMITS,
  EMPTY_DEMAND_FORM,
  validateDemand,
  type DemandFormErrors,
  type DemandFormValues,
  type TriState,
} from "@/lib/demand-validation";
import { demandFormErrorMessage, type DemandPayload } from "@/lib/demands-api";
import { budgetTypeLabels, demandStatusLabels, demandTypeLabels } from "@/lib/labels";
import { TRI_STATE_LABELS } from "@/lib/demand-display";
import { cn } from "@/lib/utils";
import type { BudgetType, DemandStatus, DemandType } from "@/types/api";

const DEMAND_TYPES = Object.keys(demandTypeLabels) as DemandType[];
const DEMAND_STATUSES = Object.keys(demandStatusLabels) as DemandStatus[];
const BUDGET_TYPES = Object.keys(budgetTypeLabels) as BudgetType[];

const TRI_STATE_OPTIONS: ReadonlyArray<{ value: TriState; label: string }> = (
  Object.keys(TRI_STATE_LABELS) as TriState[]
).map((value) => ({ value, label: TRI_STATE_LABELS[value] }));

interface DemandFormProps {
  mode: "create" | "edit";
  initialValues?: DemandFormValues;
  /** Name of the client already linked (edit screen), for the picker fallback. */
  initialClientLabel?: string;
  onSubmit: (payload: DemandPayload) => Promise<void>;
  onCancel: () => void;
  /** Offered next to a 409 so the patronne can reload instead of overwriting. */
  onReload?: () => void;
}

const TEXTS = {
  create: { submit: "Créer la demande", submitting: "Création…" },
  edit: { submit: "Enregistrer les modifications", submitting: "Enregistrement…" },
} as const;

function Field({
  id,
  label,
  required = false,
  error,
  hint,
  counter,
  className,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  counter?: { current: number; max: number };
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>
          {label}
          {required ? <span className="text-destructive">*</span> : null}
        </Label>
        {counter ? (
          <span className="text-muted-foreground text-xs tabular-nums">
            {counter.current}/{counter.max}
          </span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : hint ? (
        <p className="text-muted-foreground text-xs">{hint}</p>
      ) : null}
    </div>
  );
}

function errorProps(id: string, error?: string) {
  return {
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : undefined,
  };
}

/**
 * Create / edit form of a demand (Feature 20).
 *
 * Every rule mirrors the F06 contract: client and type required, budget
 * consistency per budget type, people ≥ 1, documented length limits, and event
 * details only for an `EVENT` demand (optional, but `eventType` becomes
 * mandatory as soon as anything is filled).
 */
export function DemandForm({
  mode,
  initialValues,
  initialClientLabel,
  onSubmit,
  onCancel,
  onReload,
}: DemandFormProps) {
  const [values, setValues] = useState<DemandFormValues>(initialValues ?? EMPTY_DEMAND_FORM);
  const [errors, setErrors] = useState<DemandFormErrors>({});
  const [apiError, setApiError] = useState<ApiError | Error | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof DemandFormValues>(field: K, value: DemandFormValues[K]) {
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
    const result = validateDemand(values);
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

  const isEvent = values.type === "EVENT";
  const conflict = apiError instanceof ApiError && apiError.status === 409;

  return (
    <form className="grid gap-8" noValidate onSubmit={handleSubmit}>
      {apiError ? (
        <Alert variant="destructive">
          <AlertTitle>Enregistrement impossible</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{demandFormErrorMessage(apiError)}</span>
            {conflict && onReload ? (
              <Button type="button" size="sm" variant="outline" onClick={onReload}>
                Recharger la demande
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <fieldset className="grid gap-4 border-b pb-8">
        <legend className="mb-3 text-sm font-semibold">Client</legend>
        <ClientSelect
          value={values.clientId}
          onChange={(clientId) => update("clientId", clientId)}
          invalid={Boolean(errors.clientId)}
          describedBy={errors.clientId ? "demand-client-error" : undefined}
          fallback={
            initialClientLabel ? { id: values.clientId, label: initialClientLabel } : null
          }
        />
        {errors.clientId ? (
          <p id="demand-client-error" role="alert" className="text-destructive text-xs">
            {errors.clientId}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="grid gap-4 border-b pb-8">
        <legend className="mb-3 text-sm font-semibold">Demande</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="demand-type" label="Type de demande" required error={errors.type}>
            <Select
              id="demand-type"
              value={values.type}
              onChange={(event) => update("type", event.target.value as DemandType | "")}
              {...errorProps("demand-type", errors.type)}
            >
              <option value="">Choisir un type…</option>
              {DEMAND_TYPES.map((type) => (
                <option key={type} value={type}>
                  {demandTypeLabels[type]}
                </option>
              ))}
            </Select>
          </Field>

          <Field id="demand-status" label="Statut">
            <Select
              id="demand-status"
              value={values.status}
              onChange={(event) => update("status", event.target.value as DemandStatus)}
            >
              {DEMAND_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {demandStatusLabels[status]}
                </option>
              ))}
            </Select>
          </Field>

          <Field id="demand-date" label="Date souhaitée" error={errors.requestedDate}>
            <Input
              id="demand-date"
              type="date"
              value={values.requestedDate}
              onChange={(event) => update("requestedDate", event.target.value)}
              {...errorProps("demand-date", errors.requestedDate)}
            />
          </Field>

          <Field
            id="demand-people"
            label="Nombre de personnes"
            error={errors.estimatedPeople}
            hint="Facultatif"
          >
            <Input
              id="demand-people"
              inputMode="numeric"
              placeholder="120"
              value={values.estimatedPeople}
              onChange={(event) => update("estimatedPeople", event.target.value)}
              {...errorProps("demand-people", errors.estimatedPeople)}
            />
          </Field>
        </div>

        <Field
          id="demand-location"
          label="Localisation"
          error={errors.location}
          counter={{ current: values.location.length, max: DEMAND_LIMITS.location }}
        >
          <Input
            id="demand-location"
            maxLength={DEMAND_LIMITS.location}
            placeholder="Salle des fêtes, Antananarivo"
            value={values.location}
            onChange={(event) => update("location", event.target.value)}
            {...errorProps("demand-location", errors.location)}
          />
        </Field>

        <Field
          id="demand-notes"
          label="Notes"
          error={errors.notes}
          counter={{ current: values.notes.length, max: DEMAND_LIMITS.notes }}
        >
          <Textarea
            id="demand-notes"
            maxLength={DEMAND_LIMITS.notes}
            placeholder="Précisions du client…"
            value={values.notes}
            onChange={(event) => update("notes", event.target.value)}
            {...errorProps("demand-notes", errors.notes)}
          />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 border-b pb-8">
        <legend className="mb-3 text-sm font-semibold">Budget</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="demand-budget-type" label="Type de budget">
            <Select
              id="demand-budget-type"
              value={values.budgetType}
              onChange={(event) => update("budgetType", event.target.value as BudgetType)}
            >
              {BUDGET_TYPES.map((type) => (
                <option key={type} value={type}>
                  {budgetTypeLabels[type]}
                </option>
              ))}
            </Select>
          </Field>

          {values.budgetType === "EXACT" ? (
            <Field
              id="demand-budget-exact"
              label="Budget exact (Ar)"
              error={errors.budgetMin}
            >
              <Input
                id="demand-budget-exact"
                inputMode="decimal"
                placeholder="500 000"
                value={values.budgetMin}
                onChange={(event) => update("budgetMin", event.target.value)}
                {...errorProps("demand-budget-exact", errors.budgetMin)}
              />
            </Field>
          ) : null}
        </div>

        {values.budgetType === "RANGE" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="demand-budget-min" label="Budget minimum (Ar)" error={errors.budgetMin}>
              <Input
                id="demand-budget-min"
                inputMode="decimal"
                placeholder="400 000"
                value={values.budgetMin}
                onChange={(event) => update("budgetMin", event.target.value)}
                {...errorProps("demand-budget-min", errors.budgetMin)}
              />
            </Field>
            <Field id="demand-budget-max" label="Budget maximum (Ar)" error={errors.budgetMax}>
              <Input
                id="demand-budget-max"
                inputMode="decimal"
                placeholder="800 000"
                value={values.budgetMax}
                onChange={(event) => update("budgetMax", event.target.value)}
                {...errorProps("demand-budget-max", errors.budgetMax)}
              />
            </Field>
          </div>
        ) : null}

        {values.budgetType === "NONE" ? (
          <p className="text-muted-foreground text-sm">
            Aucun budget ne sera enregistré pour cette demande.
          </p>
        ) : null}
      </fieldset>

      {isEvent ? (
        <fieldset className="grid gap-4 border-b pb-8">
          <legend className="mb-3 text-sm font-semibold">Informations événementielles</legend>
          <p className="text-muted-foreground -mt-2 text-xs">
            Facultatives. Si vous saisissez une information, le type d'événement devient
            obligatoire.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="demand-event-type"
              label="Type d'événement"
              error={errors.eventType}
              counter={{ current: values.eventType.length, max: DEMAND_LIMITS.eventType }}
              hint="Mariage, anniversaire, séminaire…"
            >
              <Input
                id="demand-event-type"
                maxLength={DEMAND_LIMITS.eventType}
                placeholder="Mariage"
                value={values.eventType}
                onChange={(event) => update("eventType", event.target.value)}
                {...errorProps("demand-event-type", errors.eventType)}
              />
            </Field>

            <Field
              id="demand-event-hall-name"
              label="Salle souhaitée"
              error={errors.desiredHall}
              counter={{ current: values.desiredHall.length, max: DEMAND_LIMITS.desiredHall }}
            >
              <Input
                id="demand-event-hall-name"
                maxLength={DEMAND_LIMITS.desiredHall}
                placeholder="Salle A"
                value={values.desiredHall}
                onChange={(event) => update("desiredHall", event.target.value)}
                {...errorProps("demand-event-hall-name", errors.desiredHall)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field id="demand-event-hall" label="Salle">
              <Select
                id="demand-event-hall"
                value={values.hallNeeded}
                onChange={(event) => update("hallNeeded", event.target.value as TriState)}
              >
                {TRI_STATE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field id="demand-event-catering" label="Traiteur">
              <Select
                id="demand-event-catering"
                value={values.cateringRequested}
                onChange={(event) => update("cateringRequested", event.target.value as TriState)}
              >
                {TRI_STATE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field id="demand-event-decoration" label="Décoration">
              <Select
                id="demand-event-decoration"
                value={values.decorationRequested}
                onChange={(event) => update("decorationRequested", event.target.value as TriState)}
              >
                {TRI_STATE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field id="demand-event-florist" label="Fleuriste">
              <Select
                id="demand-event-florist"
                value={values.floristRequested}
                onChange={(event) => update("floristRequested", event.target.value as TriState)}
              >
                {TRI_STATE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field id="demand-event-equipment" label="Location de matériel">
              <Select
                id="demand-event-equipment"
                value={values.equipmentRentalRequested}
                onChange={(event) =>
                  update("equipmentRentalRequested", event.target.value as TriState)
                }
              >
                {TRI_STATE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field id="demand-event-transport" label="Transport">
              <Select
                id="demand-event-transport"
                value={values.transportRequested}
                onChange={(event) => update("transportRequested", event.target.value as TriState)}
              >
                {TRI_STATE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field
            id="demand-event-theme"
            label="Thème"
            error={errors.theme}
            counter={{ current: values.theme.length, max: DEMAND_LIMITS.theme }}
          >
            <Input
              id="demand-event-theme"
              maxLength={DEMAND_LIMITS.theme}
              placeholder="Champêtre, tropical, classique…"
              value={values.theme}
              onChange={(event) => update("theme", event.target.value)}
              {...errorProps("demand-event-theme", errors.theme)}
            />
          </Field>

          <Field
            id="demand-event-notes"
            label="Notes événementielles"
            error={errors.eventNotes}
            counter={{ current: values.eventNotes.length, max: DEMAND_LIMITS.eventNotes }}
          >
            <Textarea
              id="demand-event-notes"
              maxLength={DEMAND_LIMITS.eventNotes}
              placeholder="Contraintes, préférences, heure d'arrivée…"
              value={values.eventNotes}
              onChange={(event) => update("eventNotes", event.target.value)}
              {...errorProps("demand-event-notes", errors.eventNotes)}
            />
          </Field>
        </fieldset>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
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
