package mg.rosii.management.payment.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

import mg.rosii.management.payment.Payment;
import mg.rosii.management.payment.PaymentMethod;

/**
 * Payment representation. {@code version} is exposed so clients can supply it on
 * update/delete. No financial aggregate is stored here: the proposal exposes the
 * derived totals (totalPaid, remainingAmount, depositReached).
 */
public record PaymentResponse(
        UUID id,
        UUID proposalId,
        String proposalNumber,
        BigDecimal amount,
        PaymentMethod method,
        LocalDate paymentDate,
        String reference,
        String notes,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        long version) {

    public static PaymentResponse from(Payment payment) {
        return new PaymentResponse(
                payment.getId(),
                payment.getProposal().getId(),
                payment.getProposal().getNumber(),
                payment.getAmount(),
                payment.getMethod(),
                payment.getPaymentDate(),
                payment.getReference(),
                payment.getNotes(),
                payment.getCreatedAt(),
                payment.getUpdatedAt(),
                payment.getVersion());
    }
}