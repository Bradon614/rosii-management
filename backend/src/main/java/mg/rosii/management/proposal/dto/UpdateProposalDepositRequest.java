package mg.rosii.management.proposal.dto;

import java.math.BigDecimal;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;

/**
 * Deposit-only update payload for PATCH /api/proposals/{id}/deposit.
 *
 * <p>The requested deposit stays editable independently of the commercial
 * content (which is frozen from SENT onwards) until a future preparation feature
 * locks it — Feature 08 introduces no preparation state. The {@code version} is
 * required for optimistic locking (409 on stale).
 */
public record UpdateProposalDepositRequest(
        @NotNull @DecimalMin(value = "0.0", inclusive = false) @Digits(integer = 12, fraction = 2) BigDecimal requiredDeposit,
        @NotNull Long version) {
}