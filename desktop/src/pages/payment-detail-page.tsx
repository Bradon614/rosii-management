import { Link, useLocation, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, CheckCircle2, Coins, RefreshCw, Wallet } from "lucide-react";

import { DetailItem, DetailList, DetailNote } from "@/components/dossier/detail-list";
import { SectionCard } from "@/components/dossier/section-card";
import { PaymentDocuments } from "@/components/payments/payment-documents";
import { ProposalStatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/use-api-query";
import { formatAriary, formatDate, formatDateTime } from "@/lib/format";
import { paymentMethodLabels } from "@/lib/labels";
import { paymentErrorMessage } from "@/lib/payments-api";
import type { Client, Payment, Proposal } from "@/types/api";

function PaymentDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <Skeleton className="h-5 w-36" />
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

/**
 * Payment detail (Feature 22): the recorded payment, its proposal context and
 * the receipts/invoices already issued. Read-only — F08's update/delete are not
 * part of this feature's scope.
 */
export function PaymentDetailPage() {
  const { paymentId } = useParams<{ paymentId: string }>();
  const location = useLocation();
  const flash = (location.state as { flash?: string } | null)?.flash ?? null;

  const { data, error, loading, reload } = useApiQuery<Payment>(
    paymentId ? `/api/payments/${paymentId}` : null,
  );
  const { data: proposal } = useApiQuery<Proposal>(
    data ? `/api/proposals/${data.proposalId}` : null,
  );
  const { data: client } = useApiQuery<Client>(
    proposal ? `/api/clients/${proposal.clientId}` : null,
  );

  if (!paymentId) {
    return (
      <ErrorState
        title="Paiement introuvable"
        description="Aucun identifiant de paiement n'a été fourni."
        action={
          <Button asChild variant="outline">
            <Link to="/paiements">Retour aux paiements</Link>
          </Button>
        }
      />
    );
  }

  if (loading && !data) {
    return <PaymentDetailSkeleton />;
  }

  if (error) {
    const notFound = error.isNotFound;
    return (
      <ErrorState
        title={notFound ? "Paiement introuvable" : "Chargement impossible"}
        description={notFound ? "Ce paiement n'existe pas ou a été supprimé." : paymentErrorMessage(error)}
        action={
          <>
            {!notFound ? (
              <Button type="button" onClick={reload}>
                <RefreshCw aria-hidden />
                Réessayer
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link to="/paiements">Retour aux paiements</Link>
            </Button>
          </>
        }
      />
    );
  }

  if (!data) {
    return null;
  }

  const payment = data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          to="/paiements"
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Retour aux paiements
        </Link>
      </div>

      {flash ? (
        <Alert variant="success">
          <CheckCircle2 aria-hidden />
          <AlertTitle>Opération réussie</AlertTitle>
          <AlertDescription>{flash}</AlertDescription>
        </Alert>
      ) : null}

      <header>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground font-mono text-sm">{payment.proposalNumber}</span>
          <span className="text-muted-foreground text-sm">·</span>
          <span className="text-muted-foreground text-sm">{paymentMethodLabels[payment.method]}</span>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Paiement du {formatDate(payment.paymentDate)}
        </h1>
        <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <CalendarDays className="size-4" aria-hidden />
          Enregistré le {formatDateTime(payment.createdAt)}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Paiement" description="Encaissement enregistré" icon={Coins}>
          <DetailList className="sm:grid-cols-1">
            <DetailItem label="Montant" value={formatAriary(payment.amount)} />
            <DetailItem label="Méthode" value={paymentMethodLabels[payment.method]} />
            <DetailItem label="Date du paiement" value={formatDate(payment.paymentDate)} />
            <DetailItem label="Référence" value={payment.reference} />
            <DetailNote label="Notes" value={payment.notes} />
          </DetailList>
        </SectionCard>

        <SectionCard
          title="Proposition"
          description="Proposition encaissée"
          icon={Wallet}
          action={
            <Link
              to={`/propositions/${payment.proposalId}`}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
            >
              Ouvrir la proposition
            </Link>
          }
        >
          <DetailList className="sm:grid-cols-1">
            <DetailItem label="Numéro" value={payment.proposalNumber} />
            {proposal ? (
              <>
                <DetailItem label="Statut">
                  <ProposalStatusBadge status={proposal.status} />
                </DetailItem>
                <DetailItem label="Client" value={client?.name ?? null} />
                <DetailItem label="Total" value={formatAriary(proposal.proposalTotal)} />
                <DetailItem label="Total payé" value={formatAriary(proposal.totalPaid)} />
                <DetailItem label="Reste à payer" value={formatAriary(proposal.remainingAmount)} />
              </>
            ) : null}
          </DetailList>
        </SectionCard>
      </div>

      <SectionCard
        title="Reçus et factures"
        description="Documents déjà émis pour ce paiement"
        icon={CalendarDays}
      >
        <PaymentDocuments paymentId={payment.id} />
      </SectionCard>
    </div>
  );
}
