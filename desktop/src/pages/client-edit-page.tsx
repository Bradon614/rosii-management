import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, RefreshCw } from "lucide-react";

import { ClientForm } from "@/components/clients/client-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/use-api-query";
import { clientToFormValues, type ClientPayload } from "@/lib/client-validation";
import { clientErrorMessage, clientsApi } from "@/lib/clients-api";
import type { Client } from "@/types/api";

function ClientEditSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <Skeleton className="h-5 w-36" />
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

/**
 * Edit a client (Feature 19). The form is keyed by the server `version`: after a
 * conflict is reloaded, it is rebuilt from the fresh record instead of keeping
 * stale values that would overwrite someone else's change.
 */
export function ClientEditPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useApiQuery<Client>(
    clientId ? `/api/clients/${clientId}` : null,
  );

  async function handleSubmit(payload: ClientPayload) {
    if (!data) {
      return;
    }
    const updated = await clientsApi.update(data.id, payload);
    navigate(`/clients/${updated.id}`, {
      state: { flash: "Les modifications ont été enregistrées." },
    });
  }

  if (!clientId) {
    return (
      <ErrorState
        title="Client introuvable"
        description="Aucun identifiant de client n'a été fourni."
        action={
          <Button asChild variant="outline">
            <Link to="/clients">Retour aux clients</Link>
          </Button>
        }
      />
    );
  }

  if (loading && !data) {
    return <ClientEditSkeleton />;
  }

  if (error) {
    const notFound = error.isNotFound;
    return (
      <ErrorState
        title={notFound ? "Client introuvable" : "Chargement impossible"}
        description={
          notFound ? "Ce client n'existe pas ou a été supprimé." : clientErrorMessage(error)
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
              <Link to="/clients">Retour aux clients</Link>
            </Button>
          </>
        }
      />
    );
  }

  if (!data) {
    return null;
  }

  const client = data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          to={`/clients/${client.id}`}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Retour à la fiche client
        </Link>
      </div>

      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Pencil className="text-muted-foreground size-5" aria-hidden />
          Modifier le client
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{client.name}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Informations du client</CardTitle>
          <CardDescription>
            Ces champs remplacent les valeurs enregistrées. Les dates et le numéro de version sont
            gérés par le serveur.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClientForm
            key={client.version}
            mode="edit"
            initialValues={clientToFormValues(client)}
            onSubmit={handleSubmit}
            onCancel={() => navigate(`/clients/${client.id}`)}
            onReload={reload}
          />
        </CardContent>
      </Card>
    </div>
  );
}
