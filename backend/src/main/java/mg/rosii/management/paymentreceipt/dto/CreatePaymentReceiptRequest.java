package mg.rosii.management.paymentreceipt.dto;

import java.util.UUID;

import jakarta.validation.constraints.NotNull;

/**
 * Receipt creation payload: only the payment to justify. Every other field
 * (receiptNumber, amount, paymentMethod, paymentDate, paymentReference) is
 * deliberately absent here — the backend derives them from the payment and
 * generates the number itself; the client can never provide them.
 *
 * <p>The service enforces the rules (existing active payment 404, one active
 * receipt per payment 409).
 */
public record CreatePaymentReceiptRequest(
        @NotNull UUID paymentId) {
}