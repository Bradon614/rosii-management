package mg.rosii.management.proposal.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Proposal creation payload. Client and demand are mandatory (Decision A) and
 * must belong together (checked by the service). Status always starts as DRAFT.
 *
 * <p>Lengths (documented API contract): title 200, notes 2000.
 */
public record CreateProposalRequest(
        @NotNull UUID clientId,
        @NotNull UUID demandId,
        @Size(max = 200) String title,
        LocalDate validUntil,
        @Size(max = 2000) String notes,
        @NotEmpty List<@Valid ProposalLineRequest> lines) {
}
