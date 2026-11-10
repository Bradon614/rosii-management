package mg.rosii.management.execution.dto;

import java.time.LocalDate;
import java.time.LocalTime;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Operational-info update payload for PUT /api/executions/{id}.
 *
 * <p>{@code scheduledDate} is mandatory while the execution is PLANNED — the
 * status lives in the database, not in the payload, so the conditional rule is
 * enforced by the service (400 when it is missing, no date is ever invented
 * server-side). While IN_PROGRESS the schedule is locked and the field becomes
 * optional: an omitted ({@code null}) schedule value keeps the stored one, so a
 * location or notes correction never needs an invented date. {@code endTime}
 * must not be before {@code startTime} when both are given (400 while PLANNED),
 * and nothing is editable once COMPLETED or CANCELLED (409).
 *
 * <p>The {@code version} is required for optimistic locking (409 on stale) and
 * is never modified. Lengths (documented API contract): location 500, notes 2000.
 */
public record UpdateExecutionRequest(
        @NotNull Long version,
        LocalDate scheduledDate,
        LocalTime startTime,
        LocalTime endTime,
        @Size(max = 500) String location,
        @Size(max = 2000) String notes) {
}
