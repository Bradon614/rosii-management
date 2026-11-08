import { useMemo } from "react";
import { ReceiptText } from "lucide-react";

import { PdfDownloadButton } from "@/components/dossier/pdf-download-button";
import { SectionCard } from "@/components/dossier/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatAriary, formatDate } from "@/lib/format";
import type { Invoice, Payment } from "@/types/api";

/**
 * Invoices issued for the payments of the proposal. Each row links back to its
 * payment (date + amount) so the patronne can reconcile documents and
 * encaissements. The PDF is the existing `/api/invoices/{id}/pdf` document.
 */
export function InvoicesSection({
  invoices,
  payments,
}: {
  invoices: Invoice[];
  payments: Payment[];
}) {
  const paymentsById = useMemo(
    () => new Map(payments.map((payment) => [payment.id, payment])),
    [payments],
  );

  return (
    <SectionCard
      title="Factures"
      description={
        invoices.length === 0
          ? "Aucune facture émise"
          : invoices.length === 1
            ? "1 facture émise"
            : `${invoices.length} factures émises`
      }
      icon={ReceiptText}
    >
      {invoices.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="Aucune facture"
          description="Aucune facture n'a encore été émise pour les paiements de cette proposition."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Numéro</TableHead>
              <TableHead className="hidden sm:table-cell">Émission</TableHead>
              <TableHead className="hidden sm:table-cell">Paiement associé</TableHead>
              <TableHead className="text-right">Montant</TableHead>
              <TableHead className="text-right">Document</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => {
              const payment = paymentsById.get(invoice.paymentId);
              return (
                <TableRow key={invoice.id}>
                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    <span className="block">{invoice.invoiceNumber}</span>
                    <span className="text-muted-foreground mt-0.5 block font-sans text-xs sm:hidden">
                      Émise le {formatDate(invoice.issuedAt?.slice(0, 10) ?? null)}
                    </span>
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap sm:table-cell">
                    {formatDate(invoice.issuedAt?.slice(0, 10) ?? null)}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden sm:table-cell">
                    {payment
                      ? `${formatDate(payment.paymentDate)} · ${formatAriary(payment.amount)}`
                      : "Paiement non disponible"}
                  </TableCell>
                  <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">
                    {formatAriary(invoice.amount)}
                  </TableCell>
                  <TableCell className="flex justify-end">
                    <PdfDownloadButton
                      path={`/api/invoices/${invoice.id}/pdf`}
                      fallbackFilename={`${invoice.invoiceNumber}.pdf`}
                      label="PDF"
                      srLabel={`de la facture ${invoice.invoiceNumber}`}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </SectionCard>
  );
}
