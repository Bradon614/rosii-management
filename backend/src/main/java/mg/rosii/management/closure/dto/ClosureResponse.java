package mg.rosii.management.closure.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

import mg.rosii.management.closure.ClosureStatus;
import mg.rosii.management.closure.ServiceClosure;

/**
 * Closure representation — the closure data plus the server-stamped timestamps.
 * {@code version} is exposed so clients can supply it on update (409 on stale or
 * on the definitive-closure rule). No commercial or financial field appears
 * here: the proposal keeps owning them.
 */
public record ClosureResponse(
        UUID id,
        UUID preparationId,
        ClosureStatus status,
        OffsetDateTime closedAt,
        String finalNotes,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        long version) {

    public static ClosureResponse from(ServiceClosure closure) {
        return new ClosureResponse(
                closure.getId(),
                closure.getPreparation().getId(),
                closure.getStatus(),
                closure.getClosedAt(),
                closure.getFinalNotes(),
                closure.getCreatedAt(),
                closure.getUpdatedAt(),
                closure.getVersion());
    }
}