import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  Coins,
  FolderOpen,
  Pencil,
  RefreshCw,
  User,
} from "lucide-react";

import { DetailItem, DetailList, DetailNote } from "@/components/dossier/detail-list";
import { SectionCard } from "@/components/dossier/section-card";
import { DepositEditor } from "@/components/payments/deposit-editor";
import { ProposalPaymentsCard } from "@/components/payments/proposal-payments-card";
import { PreparationManagementCard } from "@/components/preparations/preparation-management-card";
import { FinancialSummary } from "@/components/proposals/financial-summary";
import { ProposalLifecycleCard } from "@/components/proposals/proposal-lifecycle";
import { ProposalLinesTable } from "@/components/proposals/proposal-lines-table";
import { ProposalStatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDemandBudget } from "@/lib/demand-display";
import { useApiQuery } from "@/hooks/use-api-query";
import { formatDate, formatDateTime } from "@/lib/format";
import { demandStatusLabels, demandTypeLabels } from "@/lib/labels";
import { proposalErrorMessage, proposalsApi } from "@/lib/proposals-api";
import { preparationPathByProposal } from "@/lib/preparations-api";
import type { Client, Demand, Preparation, Proposal } from "@/types/api";

function ProposalDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-28 w-full" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

/** Dates shown under the title, only when they exist. */
function proposalDates(proposal: Proposal): string {
  const parts = [`Créée le ${formatDateTime(proposal.createdAt)}`];
  parts.push(
    proposal.validUntil
      ? `Valide jusqu'au ${formatDate(proposal.validUntil)}`
      : "Validité non renseignée",
  );
  if (proposal.sentAt) {
    parts.push(`Envoyée le ${formatDateTime(proposal.sentAt)}`);
  }
  if (proposal.acceptedAt) {
    parts.push(`Acceptée le ${formatDateTime(proposal.acceptedAt)}`);
  }
  if (proposal.refusedAt) {
    parts.push(`Refusée le ${formatDateTime(proposal.refusedAt)}`);
  }
  if (proposal.cancelledAt) {
    parts.push(`Annulée le ${formatDateTime(proposal.cancelledAt)}`);
  }
  return parts.join(" · ");
}

/**
 * Proposal detail (Features 18 → 21). The F18 dossier access and financial
 * summary are preserved; Feature 21 adds the demand/client context, the edit
 * entry point (DRAFT only) and the lifecycle actions of the F07 state machine.
 */
export function ProposalDetailPage() {
  const { proposalId } = useParams<{ proposalId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const flash = (location.state as { flash?: string } | null)?.flash ?? null;

  const { data, error, loading, reload } = useApiQuery<Proposal>(
    proposalId ? `/api/proposals/${proposalId}` : null,
  );
  const { data: client } = useApiQuery<Client>(
    data ? `/api/clients/${data.clientId}` : null,
  );
  const { data: demand } = useApiQuery<Demand>(
    data ? `/api/demands/${data.demandId}` : null,
  );
  // An existing preparation locks the deposit (Feature 08 rule). F09 answers 404
  // when there is none, which is not an error here.
  const {
    data: preparation,
    error: preparationError,
    loading: preparationLoading,
    reload: reloadPreparation,
  } = useApiQuery<Preparation>(
    data ? preparationPathByProposal(data.id) : null,
  );
  const preparationLoadError =
    preparationError && !preparationError.isNotFound ? preparationError : null;

  /**
   * After a successful creation: re-read the proposal (never keep the snapshot
   * that predates the preparation), refresh the local queries, then open the new
   * preparation. A failed refresh must not cancel the redirect.
   */
  async function handlePreparationCreated(created: Preparation) {
    if (data) {
      try {
        await proposalsApi.get(data.id);
      } catch {
        // The preparation exists; the detail page will show the fresh state.
      }
    }
    reload();
    reloadPreparation();
    navigate(`/preparations/${created.id}`, {
      state: { flash: "La préparation a été créée." },
    });
  }

  if (!proposalId) {
    return (
      <ErrorState
        title="Proposition introuvable"
        description="Aucun identifiant de proposition n'a été fourni."
        action={
          <Button asChild variant="outline">
            <Link to="/propositions">Retour aux propositions</Link>
          </Button>
        }
      />
    );
  }

  if (loading && !data) {
    return <ProposalDetailSkeleton />;
  }

  if (error) {
    const notFound = error.isNotFound;
    return (
      <ErrorState
        title={notFound ? "Proposition introuvable" : "Chargement impossible"}
        description={
          notFound ? "Cette proposition n'existe pas ou a été supprimée." : proposalErrorMessage(error)
        }
        action={
          <>
            {!notFound ? (
              <Button type="button" onClick={reload}>
                <RefreshCw aria-hidden />
                Réessayer
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link to="/propositions">Retour aux propositions</Link>
            </Button>
          </>
        }
      />
    );
  }

  if (!data) {
    return null;
  }

  const proposal = data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          to="/propositions"
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Retour aux propositions
        </Link>
      </div>

      {flash ? (
        <Alert variant="success">
          <CheckCircle2 aria-hidden />
          <AlertTitle>Opération réussie</AlertTitle>
          <AlertDescription>{flash}</AlertDescription>
        </Alert>
      ) : null}

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground font-mono text-sm">{proposal.number}</span>
            <ProposalStatusBadge status={proposal.status} />
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight break-words">
            {proposal.title ?? "Proposition sans titre"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">{proposalDates(proposal)}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {proposal.status === "DRAFT" ? (
            <Button asChild variant="outline" size="sm">
              <Link to={`/propositions/${proposal.id}/edit`}>
                <Pencil aria-hidden />
                Modifier
              </Link>
            </Button>
          ) : null}
          <Button asChild size="sm">
            <Link to={`/propositions/${proposal.id}/dossier`}>
              <FolderOpen aria-hidden />
              Ouvrir le dossier de service
            </Link>
          </Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Client"
          description="Client de la proposition"
          icon={User}
          action={
            <Link
              to={`/clients/${proposal.clientId}`}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
            >
              Fiche client
              <ArrowUpRight className="size-4" aria-hidden />
            </Link>
          }
        >
          <DetailList className="sm:grid-cols-1">
            <DetailItem label="Nom" value={client?.name ?? "—"} />
          </DetailList>
        </SectionCard>

        <SectionCard
          title="Demande"
          description="Demande à l'origine de la proposition"
          icon={ClipboardList}
          action={
            <Link
              to={`/demandes/${proposal.demandId}`}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
            >
              Voir la demande
              <ArrowUpRight className="size-4" aria-hidden />
            </Link>
          }
        >
          <DetailList className="sm:grid-cols-1">
            <DetailItem label="Type" value={demand ? demandTypeLabels[demand.type] : null} />
            <DetailItem
              label="Statut"
              value={demand ? demandStatusLabels[demand.status] : null}
            />
            <DetailItem
              label="Date souhaitée"
              value={demand?.requestedDate ? formatDate(demand.requestedDate) : null}
            />
            <DetailItem label="Budget" value={demand ? formatDemandBudget(demand) : null} />
          </DetailList>
        </SectionCard>
      </div>

      <FinancialSummary proposal={proposal} />

      <SectionCard
        title="Dépôt requis"
        description="Avance demandée au client (elle n'est pas un paiement)"
        icon={Coins}
      >
        <DepositEditor
          proposal={proposal}
          canEdit={!preparation && !preparationLoadError}
          onUpdated={reload}
        />
      </SectionCard>

      <PreparationManagementCard
        proposal={proposal}
        preparation={preparation}
        loading={preparationLoading}
        loadError={preparationLoadError}
        onReload={() => {
          reload();
          reloadPreparation();
        }}
        onCreated={handlePreparationCreated}
      />

      <ProposalPaymentsCard proposal={proposal} />

      <SectionCard
        title="Lignes de la proposition"
        description={
          proposal.lines.length === 1
            ? "1 ligne commerciale"
            : `${proposal.lines.length} lignes commerciales`
        }
      >
        <ProposalLinesTable lines={proposal.lines} total={proposal.proposalTotal} />
      </SectionCard>

      {proposal.notes ? (
        <SectionCard title="Notes" description="Remarques enregistrées sur la proposition">
          <DetailNote label="Notes" value={proposal.notes} />
        </SectionCard>
      ) : null}

      <ProposalLifecycleCard proposal={proposal} onChanged={reload} onReload={reload} />
    </div>
  );
}
