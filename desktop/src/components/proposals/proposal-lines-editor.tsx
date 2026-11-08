import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatAriary } from "@/lib/format";
import {
  PROPOSAL_LIMITS,
  createEmptyLine,
  estimateProposal,
  type ProposalLineErrors,
  type ProposalLineFormValues,
} from "@/lib/proposal-validation";
import type { CatalogueService } from "@/types/api";

interface ProposalLinesEditorProps {
  lines: ProposalLineFormValues[];
  lineErrors: ProposalLineErrors[];
  services: CatalogueService[];
  onChange: (lines: ProposalLineFormValues[]) => void;
}

const AMOUNT_INPUT = (value: number): string => String(value);

/**
 * Lines of a proposal (Feature 21). Each line is a snapshot: when a catalogue
 * service is selected its name, unit and reference price seed the fields, then
 * the patronne can adjust them — the backend stores exactly what is sent and
 * never re-reads the catalogue afterwards. A line without service is allowed.
 */
export function ProposalLinesEditor({
  lines,
  lineErrors,
  services,
  onChange,
}: ProposalLinesEditorProps) {
  const estimate = estimateProposal(lines);

  function updateLine(index: number, patch: Partial<ProposalLineFormValues>) {
    onChange(lines.map((line, position) => (position === index ? { ...line, ...patch } : line)));
  }

  function handleServiceChange(index: number, serviceId: string) {
    const service = services.find((candidate) => candidate.id === serviceId);
    if (!service) {
      updateLine(index, { serviceId });
      return;
    }
    // Snapshot seeding: the values become editable immediately afterwards.
    updateLine(index, {
      serviceId,
      description: service.name,
      unit: service.defaultUnit,
      unitPrice: AMOUNT_INPUT(service.referencePrice),
    });
  }

  function addLine() {
    onChange([...lines, createEmptyLine()]);
  }

  function removeLine(index: number) {
    onChange(lines.filter((_, position) => position !== index));
  }

  return (
    <div className="grid gap-4">
      {lines.map((line, index) => {
        const errors = lineErrors[index] ?? {};
        const lineTotal = estimate.lineTotals[index] ?? 0;
        return (
          <fieldset key={line.key} className="grid gap-3 rounded-md border px-4 py-4">
            <legend className="px-1 text-xs font-medium tracking-wide uppercase">
              Ligne {index + 1}
            </legend>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor={`line-service-${index}`}>
                  Service du catalogue (facultatif)
                </Label>
                <Select
                  id={`line-service-${index}`}
                  value={line.serviceId}
                  onChange={(event) => handleServiceChange(index, event.target.value)}
                >
                  <option value="">Aucun service — ligne libre</option>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                      {service.active ? "" : " (inactif)"}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor={`line-description-${index}`}>
                  Description <span className="text-destructive">*</span>
                </Label>
                <Input
                  id={`line-description-${index}`}
                  maxLength={PROPOSAL_LIMITS.lineDescription}
                  value={line.description}
                  onChange={(event) => updateLine(index, { description: event.target.value })}
                  aria-invalid={Boolean(errors.description)}
                  aria-describedby={
                    errors.description ? `line-description-${index}-error` : undefined
                  }
                  placeholder="Traiteur mariage"
                />
                {errors.description ? (
                  <p
                    id={`line-description-${index}-error`}
                    role="alert"
                    className="text-destructive text-xs"
                  >
                    {errors.description}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="grid gap-1.5">
                <Label htmlFor={`line-unit-${index}`}>
                  Unité <span className="text-destructive">*</span>
                </Label>
                <Input
                  id={`line-unit-${index}`}
                  maxLength={PROPOSAL_LIMITS.lineUnit}
                  value={line.unit}
                  onChange={(event) => updateLine(index, { unit: event.target.value })}
                  aria-invalid={Boolean(errors.unit)}
                  aria-describedby={errors.unit ? `line-unit-${index}-error` : undefined}
                  placeholder="personne"
                />
                {errors.unit ? (
                  <p id={`line-unit-${index}-error`} role="alert" className="text-destructive text-xs">
                    {errors.unit}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor={`line-quantity-${index}`}>
                  Quantité <span className="text-destructive">*</span>
                </Label>
                <Input
                  id={`line-quantity-${index}`}
                  inputMode="decimal"
                  value={line.quantity}
                  onChange={(event) => updateLine(index, { quantity: event.target.value })}
                  aria-invalid={Boolean(errors.quantity)}
                  aria-describedby={errors.quantity ? `line-quantity-${index}-error` : undefined}
                  placeholder="80"
                />
                {errors.quantity ? (
                  <p
                    id={`line-quantity-${index}-error`}
                    role="alert"
                    className="text-destructive text-xs"
                  >
                    {errors.quantity}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor={`line-unit-price-${index}`}>
                  Prix unitaire (Ar) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id={`line-unit-price-${index}`}
                  inputMode="decimal"
                  value={line.unitPrice}
                  onChange={(event) => updateLine(index, { unitPrice: event.target.value })}
                  aria-invalid={Boolean(errors.unitPrice)}
                  aria-describedby={
                    errors.unitPrice ? `line-unit-price-${index}-error` : undefined
                  }
                  placeholder="4 500"
                />
                {errors.unitPrice ? (
                  <p
                    id={`line-unit-price-${index}-error`}
                    role="alert"
                    className="text-destructive text-xs"
                  >
                    {errors.unitPrice}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-1.5">
                <span className="text-sm leading-none font-medium">Total indicatif</span>
                <p
                  className="bg-muted/40 flex h-10 items-center rounded-md border px-3 text-sm tabular-nums"
                  data-testid={`line-total-${index}`}
                >
                  {formatAriary(lineTotal)}
                </p>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor={`line-notes-${index}`}>Notes de ligne</Label>
              <Input
                id={`line-notes-${index}`}
                maxLength={PROPOSAL_LIMITS.lineNotes}
                value={line.notes}
                onChange={(event) => updateLine(index, { notes: event.target.value })}
                aria-invalid={Boolean(errors.notes)}
                placeholder="Menu adulte, options…"
              />
              {errors.notes ? (
                <p role="alert" className="text-destructive text-xs">
                  {errors.notes}
                </p>
              ) : null}
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeLine(index)}
                aria-label={`Supprimer la ligne ${index + 1}`}
              >
                <Trash2 aria-hidden />
                Supprimer la ligne
              </Button>
            </div>
          </fieldset>
        );
      })}

      <div>
        <Button type="button" variant="outline" size="sm" onClick={addLine}>
          <Plus aria-hidden />
          Ajouter une ligne
        </Button>
      </div>
    </div>
  );
}
