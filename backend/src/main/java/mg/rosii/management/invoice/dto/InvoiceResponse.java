package mg.rosii.management.invoice.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

import mg.rosii.management.payment.PaymentMethod;
import mg.rosii.management.invoice.Invoice;

/**
 * Invoice representation — the immutable snapshot data, the server-stamped
 * emission date and the audit timestamps. {@code paymentReference} (and the
 * other snapshot fields) always reflect the payment AS IT WAS at issuance,
 * never its current state; {@code invoiceNumber} is backend-generated and
 * exposed for display. {@code version} follows the project-wide response
 * contract. No client or proposal data is duplicated here
 * (context: Payment -&gt; Proposal -&gt; Client).
 */
public record InvoiceResponse(
        UUID id,
        UUID paymentId,
        String invoiceNumber,
        BigDecimal amount,
        PaymentMethod paymentMethod,
        LocalDate paymentDate,
        String paymentReference,
        OffsetDateTime issuedAt,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        long version) {

    public static InvoiceResponse from(Invoice invoice) {
        return new InvoiceResponse(
                invoice.getId(),
                invoice.getPayment().getId(),
                invoice.getInvoiceNumber(),
                invoice.getAmount(),
                invoice.getPaymentMethod(),
                invoice.getPaymentDate(),
                invoice.getPaymentReference(),
                invoice.getIssuedAt(),
                invoice.getCreatedAt(),
                invoice.getUpdatedAt(),
                invoice.getVersion());
    }
}