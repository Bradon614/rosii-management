import { Link } from "react-router-dom";
import {
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  ClipboardList,
  Coins,
  FileText,
  RefreshCw,
  Wallet,
} from "lucide-react";

import { DashboardDistributionCard } from "@/components/dashboard/dashboard-distribution-card";
import { DashboardKpiCard } from "@/components/dashboard/dashboard-kpi-card";
import { DashboardQuickAccess } from "@/components/dashboard/dashboard-quick-access";
import { DashboardRecentActivity } from "@/components/dashboard/dashboard-recent-activity";
import type { DashboardTone } from "@/components/dashboard/dashboard-tone";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/use-api-query";
import {
  buildRecentActivity,
  DASHBOARD_PATHS,
  summarizeDashboard,
  type DashboardSourceData,
} from "@/lib/dashboard-data";
import { formatAriary, formatInteger } from "@/lib/format";
import {
  closureStatusLabels,
  demandStatusLabels,
  demandTypeLabels,
  executionStatusLabels,
  proposalStatusLabels,
} from "@/lib/labels";
import type {
  ClosureStatus,
  Demand,
  DemandStatus,
  Execution,
  ExecutionStatus,
  Payment,
  Proposal,
  ProposalStatus,
  ServiceClosure,
} from "@/types/api";

const DEMAND_STATUS_TONES: Record<DemandStatus, DashboardTone> = {
  NEW: "info",
  IN_ANALYSIS: "warning",
  PROPOSAL_IN_PREPARATION: "info",
  QUOTE_SENT: "info",
  ACCEPTED: "success",
  REFUSED: "destructive",
  ABANDONED: "outline",
};

const PROPOSAL_STATUS_TONES: Record<ProposalStatus, DashboardTone> = {
  DRAFT: "secondary",
  SENT: "info",
  ACCEPTED: "success",
  REFUSED: "destructive",
  EXPIRED: "warning",
  CANCELLED: "outline",
};

const EXECUTION_STATUS_TONES: Record<ExecutionStatus, DashboardTone> = {
  PLANNED: "info",
  IN_PROGRESS: "warning",
  COMPLETED: "success",
  CANCELLED: "outline",
};

const CLOSURE_STATUS_TONES: Record<ClosureStatus, DashboardTone> = {
  COMPLETED: "success",
  WITH_ISSUE: "warning",
};

function countLabel(count: number, singular: string, plural: string): string {
  return `${formatInteger(count)} ${count > 1 ? plural : singular}`;
}

function DashboardHeader({  refreshing,
  onRefresh,
}: {
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-muted-foreground text-sm">Groupe Chez Rosii</p>
        <h1 className="text-2xl font-semibold tracking-tight">Tableau de bord</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Bienvenue dans votre vue d&apos;ensemble de l&apos;activité.
        </p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
        <RefreshCw className={refreshing ? "animate-spin" : undefined} aria-hidden />
        Actualiser
      </Button>
    </header>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="h-32 w-full" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/**
 * Dashboard (Feature 26). Read-only: it fetches the global list endpoints that
 * actually exist and aggregates only values they expose. There is no global
 * preparation endpoint, so no active-preparation count is fabricated.
 */
export function DashboardPage() {
  const demands = useApiQuery<Demand[]>(DASHBOARD_PATHS.demands);
  const proposals = useApiQuery<Proposal[]>(DASHBOARD_PATHS.proposals);
  const payments = useApiQuery<Payment[]>(DASHBOARD_PATHS.payments);
  const executions = useApiQuery<Execution[]>(DASHBOARD_PATHS.executions);
  const closures = useApiQuery<ServiceClosure[]>(DASHBOARD_PATHS.closures);

  const queries = [demands, proposals, payments, executions, closures];
  const error = queries.find((query) => query.error)?.error ?? null;
  const anyLoading = queries.some((query) => query.loading);
  const allLoaded = queries.every((query) => query.data !== null);

  function reloadAll() {
    queries.forEach((query) => query.reload());
  }

  const data: DashboardSourceData | null = allLoaded
    ? {
        demands: demands.data ?? [],
        proposals: proposals.data ?? [],
        payments: payments.data ?? [],
        executions: executions.data ?? [],
        closures: closures.data ?? [],
      }
    : null;
  const summary = data ? summarizeDashboard(data) : null;
  const activities = data ? buildRecentActivity(data) : [];

  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <DashboardHeader refreshing={false} onRefresh={reloadAll} />
        <ErrorState
          title="Tableau de bord indisponible"
          description={error.message}
          action={
            <Button type="button" onClick={reloadAll}>
              <RefreshCw aria-hidden />
              Réessayer
            </Button>
          }
        />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex flex-col gap-6">
        <DashboardHeader refreshing={anyLoading} onRefresh={reloadAll} />
        <DashboardSkeleton />
      </div>
    );
  }

  const newDemands =
    summary.demandsByStatus.find((item) => item.status === "NEW")?.count ?? 0;
  const plannedExecutions =
    summary.executionsByStatus.find((item) => item.status === "PLANNED")?.count ?? 0;
  const inProgressExecutions =
    summary.executionsByStatus.find((item) => item.status === "IN_PROGRESS")?.count ?? 0;
  const completedExecutions =
    summary.executionsByStatus.find((item) => item.status === "COMPLETED")?.count ?? 0;
  const withIssueClosures =
    summary.closuresByStatus.find((item) => item.status === "WITH_ISSUE")?.count ?? 0;

  const allEmpty =
    summary.demandsTotal +
      summary.proposalsTotal +
      summary.paymentsCount +
      summary.executionsTotal +
      summary.closuresTotal ===
    0;

  const demandStatusItems = summary.demandsByStatus.map((item) => ({
    key: item.status,
    label: demandStatusLabels[item.status],
    count: item.count,
    tone: DEMAND_STATUS_TONES[item.status],
  }));
  const proposalStatusItems = summary.proposalsByStatus.map((item) => ({
    key: item.status,
    label: proposalStatusLabels[item.status],
    count: item.count,
    tone: PROPOSAL_STATUS_TONES[item.status],
  }));
  const executionStatusItems = summary.executionsByStatus.map((item) => ({
    key: item.status,
    label: executionStatusLabels[item.status],
    count: item.count,
    tone: EXECUTION_STATUS_TONES[item.status],
  }));
  const closureStatusItems = summary.closuresByStatus.map((item) => ({
    key: item.status,
    label: closureStatusLabels[item.status],
    count: item.count,
    tone: CLOSURE_STATUS_TONES[item.status],
  }));
  const demandTypeItems = summary.demandsByType.map((item) => ({
    key: item.type,
    label: demandTypeLabels[item.type],
    count: item.count,
    tone: "info" as const,
  }));

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader refreshing={anyLoading} onRefresh={reloadAll} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardKpiCard
          title="Demandes"
          value={formatInteger(summary.demandsTotal)}
          hint={countLabel(newDemands, "nouvelle", "nouvelles")}
          icon={ClipboardList}
          href="/demandes"
          tone="info"
          testId="kpi-demands"
        />
        <DashboardKpiCard
          title="Propositions"
          value={formatInteger(summary.proposalsTotal)}
          hint={`${countLabel(
            summary.acceptedProposals,
            "acceptée",
            "acceptées",
          )} · ${formatInteger(summary.pendingProposals)} en attente`}
          icon={FileText}
          href="/propositions"
          tone="default"
          testId="kpi-proposals"
        />
        <DashboardKpiCard
          title="Encaissements"
          value={formatAriary(summary.paymentsTotal)}
          hint={countLabel(
            summary.paymentsCount,
            "paiement enregistré",
            "paiements enregistrés",
          )}
          icon={Coins}
          href="/paiements"
          tone="success"
          testId="kpi-payments"
        />
        <DashboardKpiCard
          title="Reste à encaisser"
          value={formatAriary(summary.acceptedRemaining)}
          hint={`sur ${countLabel(
            summary.acceptedProposals,
            "proposition acceptée",
            "propositions acceptées",
          )}`}
          icon={Wallet}
          href="/propositions"
          tone="warning"
          testId="kpi-remaining"
        />
        <DashboardKpiCard
          title="Exécutions"
          value={formatInteger(summary.executionsTotal)}
          hint={`${countLabel(
            plannedExecutions,
            "planifiée",
            "planifiées",
          )} · ${countLabel(inProgressExecutions, "en cours", "en cours")} · ${countLabel(
            completedExecutions,
            "terminée",
            "terminées",
          )}`}
          icon={CalendarClock}
          href="/executions"
          tone="info"
          testId="kpi-executions"
        />
        <DashboardKpiCard
          title="Clôtures"
          value={formatInteger(summary.closuresTotal)}
          hint={`${formatInteger(withIssueClosures)} avec réserve`}
          icon={BadgeCheck}
          href="/closures"
          tone="success"
          testId="kpi-closures"
        />
        <DashboardKpiCard
          title="Dépôt non atteint"
          value={formatInteger(summary.acceptedWithoutDeposit)}
          hint={countLabel(
            summary.acceptedWithoutDeposit,
            "proposition acceptée concernée",
            "propositions acceptées concernées",
          )}
          icon={AlertTriangle}
          href="/propositions"
          tone="warning"
          testId="kpi-deposit"
        />
      </div>

      {allEmpty ? (
        <EmptyState
          icon={ClipboardList}
          title="Aucune activité enregistrée"
          description="Les indicateurs apparaîtront dès que des demandes, propositions, paiements, exécutions ou clôtures seront enregistrés."
          action={
            <Button asChild size="sm">
              <Link to="/demandes/new">Créer une demande</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <DashboardDistributionCard
              title="Demandes par statut"
              description="Répartition des demandes actives."
              items={demandStatusItems}
              total={summary.demandsTotal}
              href="/demandes"
              emptyLabel="Aucune demande enregistrée."
            />
            <DashboardDistributionCard
              title="Propositions par statut"
              description="Statuts réellement enregistrés par le backend."
              items={proposalStatusItems}
              total={summary.proposalsTotal}
              href="/propositions"
              emptyLabel="Aucune proposition enregistrée."
            />
            <DashboardDistributionCard
              title="Exécutions par statut"
              description="Suivi opérationnel des exécutions actives."
              items={executionStatusItems}
              total={summary.executionsTotal}
              href="/executions"
              emptyLabel="Aucune exécution enregistrée."
            />
            <DashboardDistributionCard
              title="Clôtures par statut"
              description="Résultat final des services clôturés."
              items={closureStatusItems}
              total={summary.closuresTotal}
              href="/closures"
              emptyLabel="Aucune clôture enregistrée."
            />
            <DashboardDistributionCard
              title="Demandes par type"
              description="Types de prestations demandées."
              items={demandTypeItems}
              total={summary.demandsTotal}
              href="/demandes"
              emptyLabel="Aucune demande enregistrée."
            />
            <DashboardRecentActivity activities={activities} />
          </div>
        </>
      )}

      <DashboardQuickAccess />
    </div>
  );
}
