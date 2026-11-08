import { Fragment, useMemo } from "react";
import { Banknote } from "lucide-react";

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
import { paymentMethodLabels } from "@/lib/labels";
import type { Payment, PaymentReceipt } from "@/types/api";

function groupReceiptsByPayment(receipts: PaymentReceipt[]): Map<string, PaymentReceipt[]> {
  const byPayment = new Map<string, PaymentReceipt[]>();
  for (const receipt of receipts) {
    const list = byPayment.get(receipt.paymentId);
    if (list) {
      list.push(receipt);
    } else {
      byPayment.set(receipt.paymentId, [receipt]);
    }
  }
  return byPayment;
}

/**
 * Active payments of the proposal, each one followed by the receipts issued for
 * it (a payment may legitimately have none). Receipt PDFs come from the
 * existing `/api/payment-receipts/{id}/pdf` endpoint.
 */
export function PaymentsSection({
  payments,
  receipts,
}: {
  payments: Payment[];
  receipts: PaymentReceipt[];
}) {
  const receiptsByPayment = useMemo(() => groupReceiptsByPayment(receipts), [receipts]);

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
      icon={Banknote}
    >
      {payments.length === 0 ? (
        <EmptyState
          icon={Banknote}
          title="Aucun paiement"
          description="Aucun encaissement n'a encore été enregistré pour cette proposition."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Montant</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="hidden sm:table-cell">Référence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((payment) => {
              const paymentReceipts = receiptsByPayment.get(payment.id) ?? [];
              return (
                <Fragment key={payment.id}>
                  <TableRow>
                    <TableCell className="font-medium tabular-nums">
                      <span className="block whitespace-nowrap">
                        {formatAriary(payment.amount)}
                      </span>
                      {payment.reference ? (
                        <span className="text-muted-foreground mt-0.5 block text-xs font-normal sm:hidden">
                          Réf. {payment.reference}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {paymentMethodLabels[payment.method]}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(payment.paymentDate)}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden sm:table-cell">
                      {payment.reference ?? "—"}
                    </TableCell>
                  </TableRow>
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={4} className="bg-muted/30 py-2">
                      {paymentReceipts.length === 0 ? (
                        <p className="text-muted-foreground text-xs">
                          Aucun reçu émis pour ce paiement.
                        </p>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                            Reçus
                          </span>
                          <ul className="flex flex-wrap items-center gap-2">
                            {paymentReceipts.map((receipt) => (
                              <li
                                key={receipt.id}
                                className="bg-background flex flex-wrap items-center gap-2 rounded-md border px-2.5 py-1.5"
                              >
                                <span className="font-mono text-xs">
                                  {receipt.receiptNumber}
                                </span>
                                <span className="text-muted-foreground text-xs">
                                  {formatAriary(receipt.amount)} ·{" "}
                                  {formatDate(receipt.paymentDate)}
                                </span>
                                <PdfDownloadButton
                                  path={`/api/payment-receipts/${receipt.id}/pdf`}
                                  fallbackFilename={`${receipt.receiptNumber}.pdf`}
                                  label="PDF"
                                  srLabel={`du reçu ${receipt.receiptNumber}`}
                                />
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      )}
    </SectionCard>
  );
}
