package mg.rosii.management.execution.dto;

import java.time.LocalDate;
import java.time.LocalTime;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Operational-info update payload for PUT /api/executions/{id}.
 *
 * <p>{@code scheduledDate} is mandatory (no date is ever invented server-side),
 * {@code endTime} must not be before {@code startTime} when both are given
 * (400), and the editable fields depend on the status: everything while
 * PLANNED, only location/notes while IN_PROGRESS (the schedule is locked),
 * nothing once COMPLETED or CANCELLED (409).
 *
 * <p>The {@code version} is required for optimistic locking (409 on stale) and
 * is never modified. Lengths (documented API contract): location 500, notes 2000.
 */
public record UpdateExecutionRequest(
        @NotNull Long version,
        @NotNull LocalDate scheduledDate,
        LocalTime startTime,
        LocalTime endTime,
        @Size(max = 500) String location,
        @Size(max = 2000) String notes) {
}