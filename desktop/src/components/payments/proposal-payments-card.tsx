import { Fragment, useMemo } from "react";
import { Link } from "react-router-dom";
import { Coins, Plus, RefreshCw } from "lucide-react";

import { PdfDownloadButton } from "@/components/dossier/pdf-download-button";
import { SectionCard } from "@/components/dossier/section-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
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
import { invoicePdfPath, receiptPdfPath } from "@/lib/documents-api";
import { formatAriary, formatDate } from "@/lib/format";
import { paymentMethodLabels } from "@/lib/labels";
import type { Invoice, Payment, PaymentReceipt, Proposal, ServiceDossier } from "@/types/api";

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const id = key(item);
    const list = map.get(id);
    if (list) {
      list.push(item);
    } else {
      map.set(id, [item]);
    }
  }
  return map;
}

function DocumentsCell({
  receipts,
  invoices,
}: {
  receipts: PaymentReceipt[];
  invoices: Invoice[];
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Reçus
        </span>
        {receipts.length === 0 ? (
          <span className="text-muted-foreground text-xs">Aucun reçu émis pour ce paiement.</span>
        ) : (
          <ul className="flex flex-wrap items-center gap-2">
            {receipts.map((receipt) => (
              <li
                key={receipt.id}
                className="bg-background flex flex-wrap items-center gap-2 rounded-md border px-2.5 py-1.5"
              >
                <span className="font-mono text-xs">{receipt.receiptNumber}</span>
                <PdfDownloadButton
                  path={receiptPdfPath(receipt.id)}
                  fallbackFilename={`${receipt.receiptNumber}.pdf`}
                  label="PDF"
                  srLabel={`du reçu ${receipt.receiptNumber}`}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Factures
        </span>
        {invoices.length === 0 ? (
          <span className="text-muted-foreground text-xs">Aucune facture émise pour ce paiement.</span>
        ) : (
          <ul className="flex flex-wrap items-center gap-2">
            {invoices.map((invoice) => (
              <li
                key={invoice.id}
                className="bg-background flex flex-wrap items-center gap-2 rounded-md border px-2.5 py-1.5"
              >
                <span className="font-mono text-xs">{invoice.invoiceNumber}</span>
                <PdfDownloadButton
                  path={invoicePdfPath(invoice.id)}
                  fallbackFilename={`${invoice.invoiceNumber}.pdf`}
                  label="PDF"
                  srLabel={`de la facture ${invoice.invoiceNumber}`}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Payments of one proposal (Feature 22), with the receipts and invoices already
 * issued for each of them.
 *
 * The service dossier (Feature 17) is used as the single source for the active
 * payments and their documents, so the screen shows exactly what the backend
 * exposes (soft-deleted rows never appear) without one request per document.
 */
export function ProposalPaymentsCard({ proposal }: { proposal: Proposal }) {
  const { data, error, loading, reload } = useApiQuery<ServiceDossier>(
    `/api/service-dossiers/${proposal.id}`,
  );

  const payments: Payment[] = data?.payments ?? [];
  const receiptsByPayment = useMemo(
    () => groupBy(data?.receipts ?? [], (receipt) => receipt.paymentId),
    [data?.receipts],
  );
  const invoicesByPayment = useMemo(
    () => groupBy(data?.invoices ?? [], (invoice) => invoice.paymentId),
    [data?.invoices],
  );

  const canRecord = proposal.status === "ACCEPTED" && proposal.remainingAmount > 0;
  const fullyPaid = proposal.status === "ACCEPTED" && proposal.remainingAmount <= 0;

  return (
    <SectionCard
      title="Paiements"
      description={
        payments.length === 0
          ? "Aucun encaissement enregistré"
          : payments.length === 1
            ? "1 paiement enregistré"
            : `${payments.length} paiements enregistrés`
      }
      icon={Coins}
      action={
        canRecord ? (
          <Button asChild size="sm">
            <Link to={`/propositions/${proposal.id}/paiements/new`}>
              <Plus aria-hidden />
              Enregistrer un paiement
            </Link>
          </Button>
        ) : null
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Chargement impossible</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>Les paiements de cette proposition n'ont pas pu être chargés.</span>
            <Button type="button" size="sm" variant="outline" onClick={reload}>
              <RefreshCw aria-hidden />
              Réessayer
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {loading && !data ? (
        <div className="grid gap-3" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : null}

      {!loading && !error && data && payments.length === 0 ? (
        <EmptyState
          icon={Coins}
          title="Aucun paiement"
          description={
            proposal.status === "ACCEPTED"
              ? "Aucun encaissement n'a encore été enregistré pour cette proposition."
              : "Seule une proposition acceptée peut recevoir des paiements."
          }
          action={
            canRecord ? (
              <Button asChild size="sm">
                <Link to={`/propositions/${proposal.id}/paiements/new`}>
                  <Plus aria-hidden />
                  Enregistrer un paiement
                </Link>
              </Button>
            ) : null
          }
        />
      ) : null}

      {payments.length > 0 ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Montant</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="hidden sm:table-cell">Méthode</TableHead>
                <TableHead className="hidden md:table-cell">Référence</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => {
                const receipts = receiptsByPayment.get(payment.id) ?? [];
                const invoices = invoicesByPayment.get(payment.id) ?? [];
                return (
                  <Fragment key={payment.id}>
                    <TableRow>
                      <TableCell className="font-medium whitespace-nowrap tabular-nums">
                        {formatAriary(payment.amount)}
                        <span className="text-muted-foreground mt-0.5 block text-xs font-normal sm:hidden">
                          {paymentMethodLabels[payment.method]} · {formatDate(payment.paymentDate)}
                        </span>
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap sm:table-cell">
                        {formatDate(payment.paymentDate)}
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap sm:table-cell">
                        {paymentMethodLabels[payment.method]}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden md:table-cell">
                        {payment.reference ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="ghost" size="sm">
                          <Link
                            to={`/paiements/${payment.id}`}
                            aria-label={`Voir le paiement de ${formatAriary(payment.amount)}`}
                          >
                            Voir
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={5} className="bg-muted/30 py-2">
                        <DocumentsCell receipts={receipts} invoices={invoices} />
                      </TableCell>
                    </TableRow>
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>

          <p className="text-muted-foreground mt-3 text-xs">
            {fullyPaid
              ? "La proposition est entièrement payée."
              : `Reste à payer : ${formatAriary(proposal.remainingAmount)} (valeur du serveur).`}
          </p>
        </>
      ) : null}
    </SectionCard>
  );
}
