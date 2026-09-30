package mg.rosii.management.execution.dto;

import java.time.LocalDate;
import java.util.UUID;

import jakarta.validation.constraints.NotNull;

/**
 * Execution creation payload: the preparation to execute. The service enforces
 * the workflow gates (existing preparation 404, ACCEPTED proposal and reached
 * required deposit 409, one active execution per preparation 409) and, when a
 * scheduledDate is provided, the availability rule (409 when another active
 * execution already occupies the date; COMPLETED and CANCELLED executions
 * never block). Without a date the Feature 10 behavior is unchanged —
 * providing a date at creation is NOT mandatory, and all other operational
 * information is still provided later through {@code PUT /api/executions/{id}}.
 */
public record CreateExecutionRequest(
        @NotNull UUID preparationId,
        LocalDate scheduledDate) {
}