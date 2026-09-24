package mg.rosii.management.execution.dto;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.UUID;

import mg.rosii.management.execution.Execution;
import mg.rosii.management.execution.ExecutionStatus;

/**
 * Execution representation — the operational info plus the server-stamped
 * transition timestamps. {@code version} is exposed so clients can supply it on
 * update (409 on stale). No commercial or financial field appears here: the
 * proposal keeps owning them.
 */
public record ExecutionResponse(
        UUID id,
        UUID preparationId,
        ExecutionStatus status,
        LocalDate scheduledDate,
        LocalTime startTime,
        LocalTime endTime,
        String location,
        String notes,
        OffsetDateTime startedAt,
        OffsetDateTime completedAt,
        OffsetDateTime cancelledAt,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        long version) {

    public static ExecutionResponse from(Execution execution) {
        return new ExecutionResponse(
                execution.getId(),
                execution.getPreparation().getId(),
                execution.getStatus(),
                execution.getScheduledDate(),
                execution.getStartTime(),
                execution.getEndTime(),
                execution.getLocation(),
                execution.getNotes(),
                execution.getStartedAt(),
                execution.getCompletedAt(),
                execution.getCancelledAt(),
                execution.getCreatedAt(),
                execution.getUpdatedAt(),
                execution.getVersion());
    }
}