package mg.rosii.management.closure.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Update payload for PUT /api/closures/{id} — kept only so the endpoint follows
 * the project's optimistic-locking contract (the version is required, 400 when
 * missing, 409 when stale).
 *
 * <p>In practice every write is refused beforehand: an active closure is
 * definitive, so the service answers 409 whatever the payload. There is
 * deliberately no status and no closedAt field — neither can ever change, and a
 * soft-deleted closure is simply 404. Length of finalNotes (documented API
 * contract): 2000.
 */
public record UpdateClosureRequest(
        @NotNull Long version,
        @Size(max = 2000) String finalNotes) {
}