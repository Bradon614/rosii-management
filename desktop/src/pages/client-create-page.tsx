import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";

import { ClientForm } from "@/components/clients/client-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ClientPayload } from "@/lib/client-validation";
import { clientsApi } from "@/lib/clients-api";

/**
 * Create a client (Feature 19). The form is only submitted to the API: the
 * success screen is reached with the client id returned by the backend, so a
 * creation is never simulated.
 */
export function ClientCreatePage() {
  const navigate = useNavigate();

  async function handleSubmit(payload: ClientPayload) {
    const created = await clientsApi.create(payload);
    navigate(`/clients/${created.id}`, {
      state: { flash: `Le client « ${created.name} » a été créé.` },
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          to="/clients"
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Retour aux clients
        </Link>
      </div>

      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Plus className="text-muted-foreground size-5" aria-hidden />
          Nouveau client
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Seuls le nom et le téléphone principal sont obligatoires. L'email n'est pas unique et reste
          facultatif.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Informations du client</CardTitle>
          <CardDescription>
            Les valeurs sont enregistrées dans la base centrale ROSII.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClientForm
            mode="create"
            onSubmit={handleSubmit}
            onCancel={() => navigate("/clients")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
