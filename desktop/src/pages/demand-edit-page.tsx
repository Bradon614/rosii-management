import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, RefreshCw } from "lucide-react";

import { DemandForm } from "@/components/demands/demand-form";
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
import { demandToFormValues } from "@/lib/demand-validation";
import { demandErrorMessage, demandsApi, type DemandPayload } from "@/lib/demands-api";
import type { Demand } from "@/types/api";

function DemandEditSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <Skeleton className="h-5 w-36" />
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-[28rem] w-full" />
    </div>
  );
}

/**
 * Edit a demand (Feature 20). The form is keyed by the server `version`: after a
 * conflict is reloaded it is rebuilt from the fresh record, so a stale state is
 * never silently written back.
 */
export function DemandEditPage() {
  const { demandId } = useParams<{ demandId: string }>();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useApiQuery<Demand>(
    demandId ? `/api/demands/${demandId}` : null,
  );

  async function handleSubmit(payload: DemandPayload) {
    if (!data) {
      return;
    }
    const updated = await demandsApi.update(data.id, {
      ...payload,
      // UpdateDemandRequest requires the version the record was loaded with.
      version: data.version,
    });
    navigate(`/demandes/${updated.id}`, {
      state: { flash: "Les modifications ont été enregistrées." },
    });
  }

  if (!demandId) {
    return (
      <ErrorState
        title="Demande introuvable"
        description="Aucun identifiant de demande n'a été fourni."
        action={
          <Button asChild variant="outline">
            <Link to="/demandes">Retour aux demandes</Link>
          </Button>
        }
      />
    );
  }

  if (loading && !data) {
    return <DemandEditSkeleton />;
  }

  if (error) {
    const notFound = error.isNotFound;
    return (
      <ErrorState
        title={notFound ? "Demande introuvable" : "Chargement impossible"}
        description={
          notFound ? "Cette demande n'existe pas ou a été supprimée." : demandErrorMessage(error)
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
              <Link to="/demandes">Retour aux demandes</Link>
            </Button>
          </>
        }
      />
    );
  }

  if (!data) {
    return null;
  }

  const demand = data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          to={`/demandes/${demand.id}`}
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Retour à la demande
        </Link>
      </div>

      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Pencil className="text-muted-foreground size-5" aria-hidden />
          Modifier la demande
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {demand.clientName} · version {demand.version}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Informations de la demande</CardTitle>
          <CardDescription>
            Les modifications remplacent les valeurs enregistrées. Le serveur refuse toute écriture
            fondée sur une version périmée.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DemandForm
            key={demand.version}
            mode="edit"
            initialValues={demandToFormValues(demand)}
            initialClientLabel={demand.clientName}
            onSubmit={handleSubmit}
            onCancel={() => navigate(`/demandes/${demand.id}`)}
            onReload={reload}
          />
        </CardContent>
      </Card>
    </div>
  );
}
