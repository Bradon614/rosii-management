import { Wallet } from "lucide-react";

import { DepositBadge } from "@/components/status-badge";
import { formatAriary } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Proposal } from "@/types/api";

function FinancialMetric({
  label,
  value,
  testId,
  tone,
}: {
  label: string;
  value: string;
  testId: string;
  tone?: string;
}) {
  return (
    <div className="bg-background rounded-md border px-4 py-3">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
      <p
        data-testid={testId}
        className={cn("mt-1 text-xl font-semibold tabular-nums", tone)}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * Financial synthesis of a proposal. Every amount is the value returned by the
 * API (proposalTotal, requiredDeposit, totalPaid, remainingAmount) and
 * `depositReached` is the backend's own derived flag: nothing is recomputed,
 * summed or compared here.
 */
export function FinancialSummary({ proposal }: { proposal: Proposal }) {
  return (
    <section
      aria-labelledby="financial-summary-heading"
      className="bg-card text-card-foreground rounded-lg border shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-md">
            <Wallet className="size-4" aria-hidden />
          </span>
          <div>
            <h2 id="financial-summary-heading" className="text-base font-semibold">
              Synthèse financière
            </h2>
            <p className="text-muted-foreground text-sm">
              Montants calculés par le serveur et affichés en l'état.
            </p>
          </div>
        </div>
        <DepositBadge reached={proposal.depositReached} />
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
        <FinancialMetric
          label="Total proposition"
          value={formatAriary(proposal.proposalTotal)}
          testId="kpi-total"
        />
        <FinancialMetric
          label="Dépôt demandé"
          value={formatAriary(proposal.requiredDeposit)}
          testId="kpi-deposit"
        />
        <FinancialMetric
          label="Total déjà payé"
          value={formatAriary(proposal.totalPaid)}
          testId="kpi-paid"
          tone="text-success"
        />
        <FinancialMetric
          label="Montant restant"
          value={formatAriary(proposal.remainingAmount)}
          testId="kpi-remaining"
          tone="text-warning"
        />
      </div>
    </section>
  );
}
