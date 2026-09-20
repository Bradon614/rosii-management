package mg.rosii.management.proposal.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Proposal update payload: all editable fields plus the expected {@code version}
 * for optimistic locking (409 on stale). Only allowed while the proposal is a
 * DRAFT; lines replace the full line set (orphan removal).
 *
 * <p>{@code requiredDeposit} is mandatory and follows the same rules as at
 * creation (service-side check: > 0 and <= proposal total).
 */
public record UpdateProposalRequest(
        @NotNull Long version,
        @NotNull UUID clientId,
        @NotNull UUID demandId,
        @Size(max = 200) String title,
        LocalDate validUntil,
        @NotNull @DecimalMin(value = "0.0", inclusive = false) @Digits(integer = 12, fraction = 2) BigDecimal requiredDeposit,
        @Size(max = 2000) String notes,
        @NotEmpty List<@Valid ProposalLineRequest> lines) {
}
