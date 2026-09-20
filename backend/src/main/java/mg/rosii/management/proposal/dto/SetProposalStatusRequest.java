package mg.rosii.management.proposal.dto;

import jakarta.validation.constraints.NotNull;

import mg.rosii.management.proposal.ProposalStatus;

/**
 * Status-change payload for PATCH /api/proposals/{id}/status. The {@code version}
 * is required for optimistic locking (409 on stale); the transition is validated
 * against the strict state machine (409 on illegal transition).
 */
public record SetProposalStatusRequest(
        @NotNull ProposalStatus status,
        @NotNull Long version) {
}
