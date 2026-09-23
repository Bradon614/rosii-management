package mg.rosii.management.preparation.dto;

import java.util.UUID;

import jakarta.validation.constraints.NotNull;

/**
 * Preparation creation payload: the proposal to prepare. The service enforces
 * the eligibility rules (existing proposal 404, ACCEPTED status and reached
 * required deposit 409).
 */
public record CreatePreparationRequest(
        @NotNull UUID proposalId) {
}
