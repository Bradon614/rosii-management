import { useState } from "react";
import { CheckCircle2, Coins, LoaderCircle, Pencil } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseDecimal } from "@/lib/decimal";
import { formatAriary, formatDateTime } from "@/lib/format";
import { proposalErrorMessage, proposalsApi } from "@/lib/proposals-api";
import type { Proposal } from "@/types/api";

interface DepositEditorProps {
  proposal: Proposal;
  /**
   * False once the service preparation has started: the deposit is then locked
   * (Feature 08 rule). The parent decides from `GET /api/preparations?proposalId=`.
   */
  canEdit: boolean;
  /** Reloads the proposal after a successful update. */
  onUpdated: () => void;
}

/**
 * Deposit (avance) editor (Feature 22). Updating it uses F07's dedicated
 * `PATCH /api/proposals/{id}/deposit` with the current version; the value can
 * never be zero/negative nor above the proposal total, exactly like the
 * backend's `applyDeposit`.
 */
export function DepositEditor({ proposal, canEdit, onUpdated }: DepositEditorProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(proposal.requiredDeposit));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  function startEditing() {
    setValue(String(proposal.requiredDeposit));
    setError(null);
    setFlash(null);
    setEditing(true);
  }

  async function save() {
    const parsed = parseDecimal(value, 12, 2);
    if (!parsed.valid) {
      setError("Le dépôt doit être un nombre avec 2 décimales maximum.");
      return;
    }
    if (parsed.value === null) {
      setError("Saisissez le dépôt demandé.");
      return;
    }
    if (parsed.value <= 0) {
      setError("Le dépôt demandé doit être supérieur à zéro.");
      return;
    }
    if (parsed.value > proposal.proposalTotal) {
      setError(
        `Le dépôt ne peut pas dépasser le total de la proposition (${formatAriary(proposal.proposalTotal)}).`,
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await proposalsApi.updateDeposit(proposal.id, parsed.value, proposal.version);
      setEditing(false);
      setFlash("Le dépôt demandé a été mis à jour.");
      onUpdated();
    } catch (cause) {
      setError(proposalErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Dépôt demandé
          </p>
          <p className="text-xl font-semibold tabular-nums" data-testid="deposit-value">
            {formatAriary(proposal.requiredDeposit)}
          </p>
          {proposal.requiredDepositUpdatedAt ? (
            <p className="text-muted-foreground mt-1 text-xs">
              Mis à jour le {formatDateTime(proposal.requiredDepositUpdatedAt)}
            </p>
          ) : null}
        </div>

        {canEdit && !editing ? (
          <Button type="button" variant="outline" size="sm" onClick={startEditing}>
            <Pencil aria-hidden />
            Modifier le dépôt
          </Button>
        ) : null}
      </div>

      {!canEdit ? (
        <p className="text-muted-foreground text-sm">
          Le dépôt n'est plus modifiable : la préparation de la prestation a démarré.
        </p>
      ) : null}

      {editing ? (
        <div className="grid gap-3 rounded-md border px-4 py-3">
          <div className="grid gap-1.5">
            <Label htmlFor="deposit-value">Nouveau dépôt demandé (Ar)</Label>
            <Input
              id="deposit-value"
              inputMode="decimal"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setError(null);
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "deposit-error" : undefined}
            />
            <p className="text-muted-foreground text-xs">
              Strictement positif et jamais supérieur au total ({formatAriary(proposal.proposalTotal)}).
            </p>
            {error ? (
              <p id="deposit-error" role="alert" className="text-destructive text-xs">
                {error}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={save} disabled={saving}>
              {saving ? <LoaderCircle className="animate-spin" aria-hidden /> : <Coins aria-hidden />}
              {saving ? "Enregistrement…" : "Enregistrer le dépôt"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              Annuler
            </Button>
          </div>
        </div>
      ) : null}

      {flash ? (
        <Alert variant="success">
          <CheckCircle2 aria-hidden />
          <AlertTitle>Dépôt mis à jour</AlertTitle>
          <AlertDescription>{flash}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
