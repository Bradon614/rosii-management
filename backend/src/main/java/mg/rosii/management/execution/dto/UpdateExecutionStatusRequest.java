package mg.rosii.management.execution.dto;

import jakarta.validation.constraints.NotNull;

import mg.rosii.management.execution.ExecutionStatus;

/**
 * Status-change payload for PATCH /api/executions/{id}/status — exactly the
 * documented body {@code {"status": "..."}}. The transition itself is validated
 * against the strict state machine (409 on illegal transition), and the entity's
 * {@code @Version} still rejects true concurrent writes (clean 409 via the
 * controller's optimistic-locking handler). Transition timestamps are stamped
 * by the server, never accepted from the client.
 */
public record UpdateExecutionStatusRequest(
        @NotNull ExecutionStatus status) {
}