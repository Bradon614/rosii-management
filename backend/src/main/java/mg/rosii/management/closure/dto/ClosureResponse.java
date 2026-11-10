package mg.rosii.management.closure.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

import mg.rosii.management.closure.ClosureStatus;
import mg.rosii.management.closure.ServiceClosure;
import mg.rosii.management.execution.Execution;
import mg.rosii.management.execution.ExecutionStatus;

/**
 * Closure representation — the closure data plus the server-stamped timestamps.
 * {@code version} is exposed so clients can supply it on update (409 on stale or
 * on the definitive-closure rule). No commercial or financial field appears
 * here: the proposal keeps owning them.
 *
 * <p>Feature 34 adds read-only context that the closure list displays:
 * {@code proposalId}/{@code proposalNumber} of the closure's preparation, and
 * {@code executionId}/{@code executionStatus} of that preparation's <em>active</em>
 * execution. Without them the UI read one preparation and one execution list per
 * closure row. They are derived, never duplicated business data, and both the
 * execution fields are {@code null} when the preparation has no active execution
 * (a soft-deleted execution never appears). The change is purely additive: no
 * existing field is renamed or retyped.
 */
public record ClosureResponse(
        UUID id,
        UUID preparationId,
        UUID proposalId,
        String proposalNumber,
        ClosureStatus status,
        OffsetDateTime closedAt,
        String finalNotes,
        UUID executionId,
        ExecutionStatus executionStatus,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        long version) {

    /**
     * @param activeExecution the active (never soft-deleted) execution of the
     *        closure's preparation, or {@code null} when there is none
     */
    public static ClosureResponse from(ServiceClosure closure, Execution activeExecution) {
        return new ClosureResponse(
                closure.getId(),
                closure.getPreparation().getId(),
                closure.getPreparation().getProposal().getId(),
                closure.getPreparation().getProposal().getNumber(),
                closure.getStatus(),
                closure.getClosedAt(),
                closure.getFinalNotes(),
                activeExecution == null ? null : activeExecution.getId(),
                activeExecution == null ? null : activeExecution.getStatus(),
                closure.getCreatedAt(),
                closure.getUpdatedAt(),
                closure.getVersion());
    }
}