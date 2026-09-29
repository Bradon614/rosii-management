package mg.rosii.management.invoice.dto;

import java.util.UUID;

import jakarta.validation.constraints.NotNull;

/**
 * Invoice creation payload: only the payment to invoice. Every other field
 * (invoiceNumber, amount, paymentMethod, paymentDate, paymentReference,
 * issuedAt) is deliberately absent here — the backend derives them from the
 * payment, generates the number and stamps issuedAt itself; the client can
 * never provide them.
 *
 * <p>The service enforces the rules (existing active payment 404, one active
 * invoice per payment 409). The payment amount is &gt; 0 by Feature 08
 * validation, so no financial data is accepted nor needed here.
 */
public record CreateInvoiceRequest(
        @NotNull UUID paymentId) {
}