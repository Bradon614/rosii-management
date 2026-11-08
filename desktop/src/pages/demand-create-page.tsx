import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";

import { DemandForm } from "@/components/demands/demand-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DemandPayload } from "@/lib/demands-api";
import { demandsApi } from "@/lib/demands-api";

/**
 * Create a demand (Feature 20). The success screen is reached only with the id
 * returned by the backend: a creation is never simulated.
 */
export function DemandCreatePage() {
  const navigate = useNavigate();

  async function handleSubmit(payload: DemandPayload) {
    const created = await demandsApi.create(payload);
    navigate(`/demandes/${created.id}`, {
      state: { flash: `La demande de « ${created.clientName} » a été créée.` },
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          to="/demandes"
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Retour aux demandes
        </Link>
      </div>

      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Plus className="text-muted-foreground size-5" aria-hidden />
          Nouvelle demande
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Une demande enregistre ce que le client souhaite. Aucune proposition, réservation ou
          paiement n'est créé à ce stade.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Informations de la demande</CardTitle>
          <CardDescription>
            Le client et le type sont obligatoires. Les autres informations restent facultatives.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DemandForm
            mode="create"
            onSubmit={handleSubmit}
            onCancel={() => navigate("/demandes")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
