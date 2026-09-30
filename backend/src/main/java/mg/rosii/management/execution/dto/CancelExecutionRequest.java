package mg.rosii.management.execution.dto;

import jakarta.validation.constraints.Size;

/**
 * Cancellation payload for PATCH /api/executions/{id}/cancel (Feature 15) —
 * the documented body {@code {"reason": "..."}}. The reason is optional (max
 * 2000 characters); {@code version} is optional and follows the optimistic
 * locking convention of the PUT update (409 on stale when provided; the
 * entity's {@code @Version} still rejects true concurrent writes at flush).
 * {@code cancelledAt} is always stamped by the server, never accepted from
 * the client.
 */
public record CancelExecutionRequest(
        @Size(max = 2000, message = "reason must not exceed 2000 characters") String reason,
        Long version) {
}
