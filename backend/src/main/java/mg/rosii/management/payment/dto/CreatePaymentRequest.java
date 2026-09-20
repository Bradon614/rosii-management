package mg.rosii.management.payment.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import mg.rosii.management.payment.PaymentMethod;

/**
 * Payment creation payload. The proposal must exist and be ACCEPTED (checked by
 * the service). {@code amount} must be > 0 and may not push the paid total above
 * the proposal total (409).
 *
 * <p>Lengths (documented API contract): reference 100, notes 2000.
 */
public record CreatePaymentRequest(
        @NotNull UUID proposalId,
        @NotNull @DecimalMin(value = "0.0", inclusive = false) @Digits(integer = 12, fraction = 2) BigDecimal amount,
        @NotNull PaymentMethod method,
        @NotNull LocalDate paymentDate,
        @Size(max = 100) String reference,
        @Size(max = 2000) String notes) {
}