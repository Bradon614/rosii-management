package mg.rosii.management.payment.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import mg.rosii.management.payment.PaymentMethod;

/**
 * Payment update payload: the editable payment attributes plus the expected
 * {@code version} for optimistic locking (409 on stale).
 *
 * <p>The proposal reference is deliberately not updatable: a payment belongs to
 * the proposal it paid, so it cannot be moved to another one.
 */
public record UpdatePaymentRequest(
        @NotNull Long version,
        @NotNull @DecimalMin(value = "0.0", inclusive = false) @Digits(integer = 12, fraction = 2) BigDecimal amount,
        @NotNull PaymentMethod method,
        @NotNull LocalDate paymentDate,
        @Size(max = 100) String reference,
        @Size(max = 2000) String notes) {
}