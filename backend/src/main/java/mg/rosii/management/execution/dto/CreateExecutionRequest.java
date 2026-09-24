package mg.rosii.management.execution.dto;

import java.util.UUID;

import jakarta.validation.constraints.NotNull;

/**
 * Execution creation payload: the preparation to execute. The service enforces
 * the workflow gates (existing preparation 404, ACCEPTED proposal and reached
 * required deposit 409, one active execution per preparation 409). All
 * operational information is provided later through
 * {@code PUT /api/executions/{id}}.
 */
public record CreateExecutionRequest(
        @NotNull UUID preparationId) {
}