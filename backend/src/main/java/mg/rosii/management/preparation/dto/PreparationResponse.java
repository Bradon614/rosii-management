package mg.rosii.management.preparation.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

import mg.rosii.management.preparation.Preparation;

/**
 * Preparation representation — the minimal link to the proposal. No financial
 * or commercial field is exposed here: the proposal keeps owning them
 * (proposalTotal, requiredDeposit, totalPaid, depositReached).
 */
public record PreparationResponse(
        UUID id,
        UUID proposalId,
        String proposalNumber,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        long version) {

    public static PreparationResponse from(Preparation preparation) {
        return new PreparationResponse(
                preparation.getId(),
                preparation.getProposal().getId(),
                preparation.getProposal().getNumber(),
                preparation.getCreatedAt(),
                preparation.getUpdatedAt(),
                preparation.getVersion());
    }
}
