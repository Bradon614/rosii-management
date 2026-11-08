/**
 * Payment documents (Features 12/13) — read-only.
 *
 * The backend exposes the receipts and invoices of one payment:
 * `GET /api/payment-receipts?paymentId=` and `GET /api/invoices?paymentId=`.
 * Their PDFs come from the existing F14 endpoints handled by `downloadPdf`.
 * Feature 22 never creates, modifies nor deletes a document.
 */

import { api } from "@/lib/api";
import type { Invoice, PaymentReceipt } from "@/types/api";

export function receiptsPath(paymentId: string): string {
  return `/api/payment-receipts?paymentId=${encodeURIComponent(paymentId)}`;
}

export function invoicesPath(paymentId: string): string {
  return `/api/invoices?paymentId=${encodeURIComponent(paymentId)}`;
}

export const documentsApi = {
  listReceipts(paymentId: string): Promise<PaymentReceipt[]> {
    return api.get<PaymentReceipt[]>(receiptsPath(paymentId));
  },
  listInvoices(paymentId: string): Promise<Invoice[]> {
    return api.get<Invoice[]>(invoicesPath(paymentId));
  },
};

/** F14 endpoints used by the existing authenticated download helper. */
export function receiptPdfPath(receiptId: string): string {
  return `/api/payment-receipts/${receiptId}/pdf`;
}

export function invoicePdfPath(invoiceId: string): string {
  return `/api/invoices/${invoiceId}/pdf`;
}
