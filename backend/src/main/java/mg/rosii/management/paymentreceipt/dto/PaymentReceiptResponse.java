package mg.rosii.management.paymentreceipt.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

import mg.rosii.management.payment.PaymentMethod;
import mg.rosii.management.paymentreceipt.PaymentReceipt;

/**
 * Payment receipt representation — the immutable snapshot data plus the
 * server-stamped timestamps. {@code paymentReference} (and the other snapshot
 * fields) always reflect the payment AS IT WAS at issuance, never its current
 * state; {@code receiptNumber} is backend-generated and exposed for display.
 * {@code version} follows the project-wide response contract. No client or
 * proposal data is duplicated here (context: Payment -&gt; Proposal -&gt; Client).
 */
public record PaymentReceiptResponse(
        UUID id,
        UUID paymentId,
        String receiptNumber,
        BigDecimal amount,
        PaymentMethod paymentMethod,
        LocalDate paymentDate,
        String paymentReference,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        long version) {

    public static PaymentReceiptResponse from(PaymentReceipt receipt) {
        return new PaymentReceiptResponse(
                receipt.getId(),
                receipt.getPayment().getId(),
                receipt.getReceiptNumber(),
                receipt.getAmount(),
                receipt.getPaymentMethod(),
                receipt.getPaymentDate(),
                receipt.getPaymentReference(),
                receipt.getCreatedAt(),
                receipt.getUpdatedAt(),
                receipt.getVersion());
    }
}