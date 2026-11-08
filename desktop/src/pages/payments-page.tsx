import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Coins,
  Eye,
  RefreshCw,
  SearchX,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApiQuery } from "@/hooks/use-api-query";
import { formatAriary, formatDate } from "@/lib/format";
import { paymentMethodLabels } from "@/lib/labels";
import { paymentErrorMessage, paymentsPath } from "@/lib/payments-api";
import type { Client, Payment, PaymentMethod, Proposal } from "@/types/api";

const PAYMENT_METHODS = Object.keys(paymentMethodLabels) as PaymentMethod[];

/**
 * Global payment list (Feature 22). F08 exposes `GET /api/payments` with
 * `proposalId`, `method` and `paymentDate` filters and no text search. The
 * `paymentDate` parameter works again since the F23 backend fix, but this F22
 * screen still exposes only `proposalId` and `method`.
 */
export function PaymentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const proposalFilter = searchParams.get("proposalId");
  const [method, setMethod] = useState<PaymentMethod | "">("");

  const { data, error, loading, reload } = useApiQuery<Payment[]>(
    paymentsPath({ proposalId: proposalFilter, method }),
  );
  const { data: proposals } = useApiQuery<Proposal[]>("/api/proposals");
  const { data: clients } = useApiQuery<Client[]>("/api/clients");
  const { data: filterProposal } = useApiQuery<Proposal>(
    proposalFilter ? `/api/proposals/${proposalFilter}` : null,
  );

  const proposalById = useMemo(
    () => new Map((proposals ?? []).map((proposal) => [proposal.id, proposal])),
    [proposals],
  );
  const clientNames = useMemo(
    () => new Map((clients ?? []).map((client) => [client.id, client.name])),
    [clients],
  );

  const payments = data ?? [];
  const filtered = Boolean(proposalFilter || method);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Paiements</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Encaissements enregistrés sur les propositions acceptées, avec leurs reçus et factures.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={reload} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : undefined} aria-hidden />
          Actualiser
        </Button>
      </header>

      {proposalFilter ? (
        <Alert>
          <AlertTitle>
            Paiements de la proposition {filterProposal ? filterProposal.number : ""}
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>Seuls les paiements de cette proposition sont affichés.</span>
            {filterProposal ? (
              <Button asChild size="sm" variant="outline">
                <Link to={`/propositions/${filterProposal.id}`}>Ouvrir la proposition</Link>
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="outline" onClick={() => setSearchParams({})}>
              Retirer le filtre
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:max-w-xs">
        <Label htmlFor="payment-filter-method">Méthode</Label>
        <Select
          id="payment-filter-method"
          value={method}
          onChange={(event) => setMethod(event.target.value as PaymentMethod | "")}
        >
          <option value="">Toutes les méthodes</option>
          {PAYMENT_METHODS.map((item) => (
            <option key={item} value={item}>
              {paymentMethodLabels[item]}
            </option>
          ))}
        </Select>
      </div>

      {filtered ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setMethod("");
              if (proposalFilter) {
                setSearchParams({});
              }
            }}
          >
            Réinitialiser les filtres
          </Button>
        </div>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Chargement impossible</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{paymentErrorMessage(error)}</span>
            <Button type="button" size="sm" variant="outline" onClick={reload}>
              Réessayer
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {loading && !data ? (
        <Card className="gap-4 p-5" aria-busy="true">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </Card>
      ) : null}

      {!loading && !error && data && payments.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={SearchX}
            title="Aucun résultat"
            description="Aucun paiement ne correspond à ces critères."
          />
        ) : (
          <EmptyState
            icon={Coins}
            title="Aucun paiement"
            description="Les encaissements se saisissent depuis la fiche d'une proposition acceptée."
          />
        )
      ) : null}

      {payments.length > 0 ? (
        <>
          <p className="text-muted-foreground text-sm" data-testid="payment-count">
            {payments.length === 1 ? "1 paiement" : `${payments.length} paiements`}
          </p>
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Proposition</TableHead>
                  <TableHead className="hidden sm:table-cell">Client</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Montant</TableHead>
                  <TableHead className="hidden md:table-cell">Méthode</TableHead>
                  <TableHead className="hidden lg:table-cell">Référence</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => {
                  const proposal = proposalById.get(payment.proposalId);
                  const clientName = proposal ? clientNames.get(proposal.clientId) : undefined;
                  return (
                    <TableRow key={payment.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(payment.paymentDate)}
                      </TableCell>
                      <TableCell className="max-w-[14rem]">
                        <Link
                          to={`/propositions/${payment.proposalId}`}
                          className="block font-mono text-xs break-words hover:underline hover:underline-offset-4"
                        >
                          {payment.proposalNumber}
                        </Link>
                        <span className="text-muted-foreground mt-0.5 block text-xs sm:hidden">
                          {formatAriary(payment.amount)} · {paymentMethodLabels[payment.method]}
                        </span>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {clientName ?? "—"}
                      </TableCell>
                      <TableCell className="hidden text-right font-medium whitespace-nowrap tabular-nums sm:table-cell">
                        {formatAriary(payment.amount)}
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap md:table-cell">
                        {paymentMethodLabels[payment.method]}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden lg:table-cell">
                        {payment.reference ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="ghost" size="sm" className="px-2 sm:px-3">
                          <Link
                            to={`/paiements/${payment.id}`}
                            aria-label={`Voir le paiement de ${formatAriary(payment.amount)}`}
                          >
                            <Eye aria-hidden />
                            <span className="hidden sm:inline">Voir</span>
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </>
      ) : null}
    </div>
  );
}
