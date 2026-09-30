package mg.rosii.management.execution.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Feature 16 — availability answer for one service date: whether an active
 * execution (PLANNED or IN_PROGRESS, never soft-deleted) already occupies the
 * date, and the IDs of the conflicting executions (empty when the date is
 * available). Deliberately simple V1 rule — one active service per local
 * date; no slots, rooms, resources or time overlaps.
 */
public record ExecutionAvailabilityResponse(
        LocalDate scheduledDate,
        boolean available,
        List<UUID> conflictingExecutionIds) {
}
