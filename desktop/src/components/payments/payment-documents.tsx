import { PdfDownloadButton } from "@/components/dossier/pdf-download-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/use-api-query";
import { invoicePdfPath, invoicesPath, receiptPdfPath, receiptsPath } from "@/lib/documents-api";
import { formatAriary, formatDate } from "@/lib/format";
import type { Invoice, PaymentReceipt } from "@/types/api";
import { ReceiptText, FileText } from "lucide-react";

function DocumentRow({
  number,
  amount,
  date,
  pdfPath,
  srLabel,
}: {
  number: string;
  amount: number;
  date: string;
  pdfPath: string;
  srLabel: string;
}) {
  return (
    <li className="bg-background flex flex-wrap items-center gap-2 rounded-md border px-2.5 py-1.5">
      <span className="font-mono text-xs">{number}</span>
      <span className="text-muted-foreground text-xs">
        {formatAriary(amount)} · {formatDate(date)}
      </span>
      <PdfDownloadButton path={pdfPath} fallbackFilename={`${number}.pdf`} label="PDF" srLabel={srLabel} />
    </li>
  );
}

/**
 * Receipts and invoices already issued for a payment (Features 12/13), with the
 * existing authenticated F14 PDF download. Read-only: Feature 22 never creates
 * nor modifies a document.
 */
export function PaymentDocuments({ paymentId }: { paymentId: string }) {
  const { data: receipts, loading: loadingReceipts } = useApiQuery<PaymentReceipt[]>(
    receiptsPath(paymentId),
  );
  const { data: invoices, loading: loadingInvoices } = useApiQuery<Invoice[]>(
    invoicesPath(paymentId),
  );

  const loading = (loadingReceipts && !receipts) || (loadingInvoices && !invoices);
  if (loading) {
    return (
      <div className="grid gap-3" aria-busy="true">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  const receiptList = receipts ?? [];
  const invoiceList = invoices ?? [];

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Reçus</p>
        {receiptList.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="Aucun reçu émis"
            description="Aucun reçu n'a encore été émis pour ce paiement."
            className="py-5"
          />
        ) : (
          <ul className="grid gap-2">
            {receiptList.map((receipt) => (
              <DocumentRow
                key={receipt.id}
                number={receipt.receiptNumber}
                amount={receipt.amount}
                date={receipt.paymentDate}
                pdfPath={receiptPdfPath(receipt.id)}
                srLabel={`du reçu ${receipt.receiptNumber}`}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-2">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Factures</p>
        {invoiceList.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Aucune facture émise"
            description="Aucune facture n'a encore été émise pour ce paiement."
            className="py-5"
          />
        ) : (
          <ul className="grid gap-2">
            {invoiceList.map((invoice) => (
              <DocumentRow
                key={invoice.id}
                number={invoice.invoiceNumber}
                amount={invoice.amount}
                date={invoice.issuedAt?.slice(0, 10) ?? invoice.paymentDate}
                pdfPath={invoicePdfPath(invoice.id)}
                srLabel={`de la facture ${invoice.invoiceNumber}`}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
