package mg.rosii.management.execution.dto;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.UUID;

import mg.rosii.management.execution.Execution;
import mg.rosii.management.execution.ExecutionStatus;

/**
 * Execution representation — the operational info plus the server-stamped
 * transition timestamps and the cancellation info (Feature 15). {@code version}
 * is exposed so clients can supply it on update (409 on stale). No commercial
 * or financial field appears here: the proposal keeps owning them.
 *
 * <p>Feature 34 adds {@code proposalId} and {@code proposalNumber}, both derived
 * from the preparation's proposal: the list screen displays and links the
 * proposal of every row, so without them the UI had to read one preparation per
 * execution. They are read-only context, never a duplicated business value, and
 * the new fields are purely additive (no existing field is renamed or retyped).
 */
public record ExecutionResponse(
        UUID id,
        UUID preparationId,
        UUID proposalId,
        String proposalNumber,
        ExecutionStatus status,
        LocalDate scheduledDate,
        LocalTime startTime,
        LocalTime endTime,
        String location,
        String notes,
        OffsetDateTime startedAt,
        OffsetDateTime completedAt,
        OffsetDateTime cancelledAt,
        String cancellationReason,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        long version) {

    public static ExecutionResponse from(Execution execution) {
        return new ExecutionResponse(
                execution.getId(),
                execution.getPreparation().getId(),
                execution.getPreparation().getProposal().getId(),
                execution.getPreparation().getProposal().getNumber(),
                execution.getStatus(),
                execution.getScheduledDate(),
                execution.getStartTime(),
                execution.getEndTime(),
                execution.getLocation(),
                execution.getNotes(),
                execution.getStartedAt(),
                execution.getCompletedAt(),
                execution.getCancelledAt(),
                execution.getCancellationReason(),
                execution.getCreatedAt(),
                execution.getUpdatedAt(),
                execution.getVersion());
    }
}