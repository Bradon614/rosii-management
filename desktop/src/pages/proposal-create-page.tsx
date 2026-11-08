import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";

import { ProposalForm } from "@/components/proposals/proposal-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { todayIsoDate } from "@/lib/format";
import { proposalsApi, type ProposalPayload } from "@/lib/proposals-api";

/**
 * Create a proposal (Feature 21). The number, the DRAFT status and the totals
 * are produced by the backend: the page only navigates to the created proposal
 * once the API confirmed it.
 */
export function ProposalCreatePage() {
  const navigate = useNavigate();

  async function handleSubmit(payload: ProposalPayload) {
    const created = await proposalsApi.create(payload);
    navigate(`/propositions/${created.id}`, {
      state: { flash: `La proposition ${created.number} a été créée.` },
    });
  }

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

      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Plus className="text-muted-foreground size-5" aria-hidden />
          Nouvelle proposition
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Une proposition est toujours liée à une demande : son client est celui de la demande. Elle
          est créée en brouillon et son numéro est généré par le serveur.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Contenu de la proposition</CardTitle>
          <CardDescription>
            Les montants officiels sont calculés par le serveur à l'enregistrement.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProposalForm
            mode="create"
            createdOn={todayIsoDate()}
            onSubmit={handleSubmit}
            onCancel={() => navigate("/propositions")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
