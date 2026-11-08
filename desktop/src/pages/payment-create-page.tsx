import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Coins, RefreshCw } from "lucide-react";

import { PaymentForm } from "@/components/payments/payment-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/use-api-query";
import { formatAriary } from "@/lib/format";
import { paymentErrorMessage, paymentsApi, type PaymentPayload } from "@/lib/payments-api";
import { proposalStatusLabels } from "@/lib/labels";
import type { Proposal } from "@/types/api";

function PaymentCreateSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

/**
 * Record a payment for one proposal (Feature 22).
 *
 * The form is only shown when the backend would accept the payment: the
 * proposal must be ACCEPTED and still have something left to pay. The final
 * decision stays server-side (409 on an unaccepted proposal or an over-total
 * amount).
 */
export function PaymentCreatePage() {
  const { proposalId } = useParams<{ proposalId: string }>();
  const navigate = useNavigate();
  const { data: proposal, error, loading, reload } = useApiQuery<Proposal>(
    proposalId ? `/api/proposals/${proposalId}` : null,
  );

  async function handleSubmit(payload: PaymentPayload) {
    const created = await paymentsApi.create(payload);
    navigate(`/paiements/${created.id}`, {
      state: { flash: `Le paiement de ${formatAriary(created.amount)} a été enregistré.` },
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

  if (loading && !proposal) {
    return <PaymentCreateSkeleton />;
  }

  if (error) {
    const notFound = error.isNotFound;
    return (
      <ErrorState
        title={notFound ? "Proposition introuvable" : "Chargement impossible"}
        description={
          notFound ? "Cette proposition n'existe pas ou a été supprimée." : paymentErrorMessage(error)
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

  if (!proposal) {
    return null;
  }

  if (proposal.status !== "ACCEPTED") {
    return (
      <ErrorState
        title="Paiement impossible"
        description={`Cette proposition est « ${proposalStatusLabels[proposal.status]} ». Seule une proposition acceptée peut recevoir un paiement.`}
        action={
          <Button asChild variant="outline">
            <Link to={`/propositions/${proposal.id}`}>Ouvrir la proposition</Link>
          </Button>
        }
      />
    );
  }

  if (proposal.remainingAmount <= 0) {
    return (
      <ErrorState
        title="Proposition entièrement payée"
        description="Le total de la proposition est déjà entièrement encaissé : aucun paiement ne peut être ajouté."
        action={
          <Button asChild variant="outline">
            <Link to={`/propositions/${proposal.id}`}>Ouvrir la proposition</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          to={`/propositions/${proposal.id}`}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Retour à la proposition
        </Link>
      </div>

      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Coins className="text-muted-foreground size-5" aria-hidden />
          Enregistrer un paiement
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {proposal.number}
          {proposal.title ? ` — ${proposal.title}` : ""} · reste à payer{" "}
          {formatAriary(proposal.remainingAmount)}
        </p>
      </header>

      <Alert>
        <AlertTitle>Proposition acceptée</AlertTitle>
        <AlertDescription>
          Le montant ne peut pas dépasser le reste à payer. Plusieurs paiements sont autorisés, y
          compris au-delà du dépôt demandé.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Encaissement</CardTitle>
          <CardDescription>
            Le total payé, le reste à payer et l'état du dépôt sont recalculés par le serveur.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PaymentForm
            proposal={proposal}
            onSubmit={handleSubmit}
            onCancel={() => navigate(`/propositions/${proposal.id}`)}
            onReload={reload}
          />
        </CardContent>
      </Card>
    </div>
  );
}
