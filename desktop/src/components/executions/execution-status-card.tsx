import { useState } from "react";
import {
  CheckCircle2,
  GitBranch,
  LoaderCircle,
  Play,
  RefreshCw,
  XCircle,
} from "lucide-react";

import { SectionCard } from "@/components/dossier/section-card";
import { ExecutionStatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  allowedExecutionTransitions,
  executionStatusErrorMessage,
  executionsApi,
} from "@/lib/executions-api";
import { executionStatusLabels } from "@/lib/labels";
import type { Execution, ExecutionStatus } from "@/types/api";

interface ExecutionStatusCardProps {
  execution: Execution;
  /** Re-reads the execution after a successful transition or a conflict. */
  onChanged: () => void;
}

const TRANSITION_LABELS: Record<ExecutionStatus, string> = {
  PLANNED: "Replanifier",
  IN_PROGRESS: "Démarrer l'exécution",
  COMPLETED: "Terminer l'exécution",
  CANCELLED: "Annuler l'exécution",
};

const TRANSITION_TITLES: Record<ExecutionStatus, string> = {
  PLANNED: "Replanifier l'exécution ?",
  IN_PROGRESS: "Démarrer l'exécution ?",
  COMPLETED: "Terminer l'exécution ?",
  CANCELLED: "Annuler l'exécution ?",
};

const TRANSITION_DESCRIPTIONS: Record<ExecutionStatus, string> = {
  PLANNED: "L'exécution reviendrait au statut « Planifiée ».",
  IN_PROGRESS:
    "Le statut passera à « En cours » et l'heure de démarrage sera enregistrée par le serveur. La date et les horaires ne seront plus modifiables.",
  COMPLETED:
    "Le statut passera à « Terminée » et l'heure de fin sera enregistrée par le serveur. Ce statut est définitif.",
  CANCELLED:
    "Le statut passera à « Annulée » et la date d'annulation sera enregistrée par le serveur. Ce statut est définitif.",
};

function TransitionIcon({ target }: { target: ExecutionStatus }) {
  if (target === "CANCELLED") {
    return <XCircle aria-hidden />;
  }
  if (target === "COMPLETED") {
    return <CheckCircle2 aria-hidden />;
  }
  return <Play aria-hidden />;
}

/**
 * Status management of one execution (Feature 24).
 *
 * Only the transitions the F10 state machine allows for the current status are
 * offered; COMPLETED and CANCELLED offer none. Every transition is explicitly
 * confirmed, uses the existing `PATCH /api/executions/{id}/status` endpoint and
 * re-reads the execution afterwards. No local state machine is invented: the
 * table comes from the same rules as the backend and the server stays the final
 * authority (409 on an illegal transition).
 */
export function ExecutionStatusCard({ execution, onChanged }: ExecutionStatusCardProps) {
  const [pending, setPending] = useState<ExecutionStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const transitions = allowedExecutionTransitions(execution.status);

  function ask(target: ExecutionStatus) {
    setError(null);
    setNotice(null);
    setPending(target);
  }

  function cancel() {
    setPending(null);
    setError(null);
  }

  function reload() {
    setError(null);
    setPending(null);
    onChanged();
  }

  async function confirm() {
    if (!pending || submitting) {
      return;
    }
    const target = pending;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await executionsApi.setStatus(execution.id, target);
      setPending(null);
      setNotice(`Le statut de l'exécution est maintenant « ${executionStatusLabels[target]} ».`);
      onChanged();
    } catch (cause) {
      setError(executionStatusErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  const confirmationVisible = pending !== null && transitions.includes(pending);

  return (
    <SectionCard
      title="Statut"
      description="Transitions autorisées par le backend (F10)"
      icon={GitBranch}
      action={<ExecutionStatusBadge status={execution.status} />}
    >
      <div className="grid gap-4">
        {notice ? (
          <Alert variant="success">
            <CheckCircle2 aria-hidden />
            <AlertTitle>Statut mis à jour</AlertTitle>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Changement de statut impossible</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>{error}</span>
              <Button type="button" size="sm" variant="outline" onClick={reload}>
                <RefreshCw aria-hidden />
                Recharger l&apos;exécution
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {transitions.length === 0 ? (
          <Alert>
            <AlertTitle>Statut définitif</AlertTitle>
            <AlertDescription>
              Une exécution « {executionStatusLabels[execution.status]} » ne peut plus changer de
              statut. Aucune transition n&apos;est proposée.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {transitions.map((target) => (
              <Button
                key={target}
                type="button"
                size="sm"
                variant={target === "CANCELLED" ? "destructive" : "default"}
                onClick={() => ask(target)}
                disabled={submitting}
              >
                <TransitionIcon target={target} />
                {TRANSITION_LABELS[target]}
              </Button>
            ))}
          </div>
        )}

        {confirmationVisible && pending ? (
          <Alert role="alertdialog" aria-label={TRANSITION_TITLES[pending]}>
            <AlertTitle>{TRANSITION_TITLES[pending]}</AlertTitle>
            <AlertDescription className="grid gap-3">
              <span>{TRANSITION_DESCRIPTIONS[pending]}</span>
              <span className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={pending === "CANCELLED" ? "destructive" : "default"}
                  onClick={confirm}
                  disabled={submitting}
                >
                  {submitting ? (
                    <LoaderCircle className="animate-spin" aria-hidden />
                  ) : (
                    <TransitionIcon target={pending} />
                  )}
                  {submitting ? "Mise à jour…" : "Confirmer"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={cancel}
                  disabled={submitting}
                >
                  Annuler
                </Button>
              </span>
            </AlertDescription>
          </Alert>
        ) : null}
      </div>
    </SectionCard>
  );
}
