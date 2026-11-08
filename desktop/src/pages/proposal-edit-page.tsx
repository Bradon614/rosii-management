import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, RefreshCw } from "lucide-react";

import { ProposalForm } from "@/components/proposals/proposal-form";
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
import { proposalToFormValues } from "@/lib/proposal-validation";
import { proposalErrorMessage, proposalsApi, type ProposalPayload } from "@/lib/proposals-api";
import type { Proposal } from "@/types/api";

function ProposalEditSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-[26rem] w-full" />
    </div>
  );
}

/**
 * Edit a proposal (Feature 21). F07 only allows editing a DRAFT: in any other
 * status the page explains it instead of showing a form the backend would
 * reject. The form is keyed by the server version so a reload after a conflict
 * rebuilds it from the fresh record.
 */
export function ProposalEditPage() {
  const { proposalId } = useParams<{ proposalId: string }>();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useApiQuery<Proposal>(
    proposalId ? `/api/proposals/${proposalId}` : null,
  );

  async function handleSubmit(payload: ProposalPayload) {
    if (!data) {
      return;
    }
    const updated = await proposalsApi.update(data.id, {
      ...payload,
      version: data.version,
    });
    navigate(`/propositions/${updated.id}`, {
      state: { flash: "Les modifications ont été enregistrées." },
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
    return <ProposalEditSkeleton />;
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

  if (proposal.status !== "DRAFT") {
    return (
      <ErrorState
        title="Modification impossible"
        description="Seule une proposition en brouillon peut être modifiée. Repassez-la en brouillon depuis sa fiche pour la corriger."
        action={
          <>
            <Button asChild variant="outline">
              <Link to={`/propositions/${proposal.id}`}>Ouvrir la proposition</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/propositions">Retour aux propositions</Link>
            </Button>
          </>
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
          <Pencil className="text-muted-foreground size-5" aria-hidden />
          Modifier la proposition
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {proposal.number} · version {proposal.version}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Contenu de la proposition</CardTitle>
          <CardDescription>
            Les modifications remplacent le contenu enregistré. Le numéro et le statut ne sont pas
            modifiables ici.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProposalForm
            key={proposal.version}
            mode="edit"
            initialValues={proposalToFormValues(proposal)}
            createdOn={proposal.createdAt.slice(0, 10)}
            onSubmit={handleSubmit}
            onCancel={() => navigate(`/propositions/${proposal.id}`)}
            onReload={reload}
          />
        </CardContent>
      </Card>
    </div>
  );
}
