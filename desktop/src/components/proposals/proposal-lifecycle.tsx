import { useState } from "react";
import { Ban, CheckCircle2, Clock, RefreshCw, Send, Undo2, XCircle } from "lucide-react";

import { SectionCard } from "@/components/dossier/section-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { proposalStatusLabels } from "@/lib/labels";
import {
  ALLOWED_TRANSITIONS,
  isTerminalStatus,
  proposalErrorMessage,
  proposalsApi,
} from "@/lib/proposals-api";
import type { Proposal, ProposalStatus } from "@/types/api";

interface ActionMeta {
  label: string;
  icon: typeof Send;
  variant: "default" | "outline" | "destructive";
  confirm: string;
}

/**
 * The confirmations only restate F07: no new business rule is introduced, and a
 * send never creates a preparation, a payment or anything operational.
 */
const ACTION_META: Record<ProposalStatus, ActionMeta> = {
  SENT: {
    label: "Envoyer la proposition",
    icon: Send,
    variant: "default",
    confirm:
      "La proposition sera figée et considérée comme envoyée au client. Son contenu ne sera plus modifiable.",
  },
  ACCEPTED: {
    label: "Accepter",
    icon: CheckCircle2,
    variant: "default",
    confirm:
      "Enregistrer l'accord du client ? Aucune préparation, réservation ou paiement n'est créé automatiquement.",
  },
  REFUSED: {
    label: "Refuser",
    icon: XCircle,
    variant: "destructive",
    confirm: "Enregistrer le refus du client ? Cette décision est définitive.",
  },
  CANCELLED: {
    label: "Annuler la proposition",
    icon: Ban,
    variant: "destructive",
    confirm: "Annuler cette proposition ? Cette décision est définitive.",
  },
  DRAFT: {
    label: "Repasser en brouillon",
    icon: Undo2,
    variant: "outline",
    confirm: "La proposition redeviendra modifiable.",
  },
  EXPIRED: {
    label: "Marquer expirée",
    icon: Clock,
    variant: "outline",
    confirm: "Marquer cette proposition comme expirée ? Cette décision est définitive.",
  },
};

interface ProposalLifecycleCardProps {
  proposal: Proposal;
  /** Called after a successful transition (the page reloads the proposal). */
  onChanged: () => void;
  onReload: () => void;
}

/**
 * Manual lifecycle of a proposal (Feature 21). Only the transitions allowed by
 * `ALLOWED_TRANSITIONS` (a mirror of the F07 state machine) are rendered; the
 * backend remains the final authority and answers 409 on anything else.
 */
export function ProposalLifecycleCard({
  proposal,
  onChanged,
  onReload,
}: ProposalLifecycleCardProps) {
  const [pending, setPending] = useState<ProposalStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const transitions = ALLOWED_TRANSITIONS[proposal.status];
  const terminal = isTerminalStatus(proposal.status);

  function choose(target: ProposalStatus) {
    setError(null);
    setFlash(null);
    if (target === "SENT" && !proposal.validUntil) {
      setError(
        "Renseignez une date de validité (bouton Modifier) avant d'envoyer la proposition.",
      );
      return;
    }
    setPending(target);
  }

  async function confirm() {
    if (!pending) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await proposalsApi.changeStatus(proposal.id, pending, proposal.version);
      setFlash(`Le statut est maintenant « ${proposalStatusLabels[updated.status]} ».`);
      setPending(null);
      onChanged();
    } catch (cause) {
      setError(proposalErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      title="Cycle de vie"
      description="Transitions autorisées par le contrat F07"
      icon={RefreshCw}
    >
      {terminal ? (
        <p className="text-muted-foreground text-sm">
          Cette proposition est dans un état définitif : aucune transition n'est possible.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {transitions.map((target) => {
            const meta = ACTION_META[target];
            const Icon = meta.icon;
            return (
              <Button
                key={target}
                type="button"
                variant={meta.variant}
                size="sm"
                onClick={() => choose(target)}
                disabled={saving || pending !== null}
              >
                <Icon aria-hidden />
                {meta.label}
              </Button>
            );
          })}
        </div>
      )}

      <p className="text-muted-foreground mt-3 text-xs">
        Les transitions sont celles du backend. Une proposition acceptée ne crée ni préparation, ni
        paiement, ni réservation.
      </p>

      {error ? (
        <Alert variant="destructive" className="mt-4">
          <AlertTitle>Changement impossible</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{error}</span>
            <Button type="button" size="sm" variant="outline" onClick={onReload}>
              Recharger la proposition
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {pending ? (
        <Alert className="mt-4">
          <AlertTitle>
            {ACTION_META[pending].label} — confirmer ?
          </AlertTitle>
          <AlertDescription className="grid gap-3">
            <span>{ACTION_META[pending].confirm}</span>
            <span className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" onClick={confirm} disabled={saving}>
                {saving ? "Enregistrement…" : "Confirmer"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPending(null)}
                disabled={saving}
              >
                Annuler
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      ) : null}

      {flash ? (
        <Alert variant="success" className="mt-4">
          <CheckCircle2 aria-hidden />
          <AlertTitle>Statut mis à jour</AlertTitle>
          <AlertDescription>{flash}</AlertDescription>
        </Alert>
      ) : null}
    </SectionCard>
  );
}
