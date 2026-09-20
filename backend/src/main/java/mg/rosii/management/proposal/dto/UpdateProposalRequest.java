package mg.rosii.management.proposal.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Proposal update payload: all editable fields plus the expected {@code version}
 * for optimistic locking (409 on stale). Only allowed while the proposal is a
 * DRAFT; lines replace the full line set (orphan removal).
 */
public record UpdateProposalRequest(
        @NotNull Long version,
        @NotNull UUID clientId,
        @NotNull UUID demandId,
        @Size(max = 200) String title,
        LocalDate validUntil,
        @Size(max = 2000) String notes,
        @NotEmpty List<@Valid ProposalLineRequest> lines) {
}
