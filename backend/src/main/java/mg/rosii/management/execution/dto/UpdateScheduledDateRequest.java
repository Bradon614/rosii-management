package mg.rosii.management.execution.dto;

import java.time.LocalDate;

import jakarta.validation.constraints.NotNull;

/**
 * Date-change payload for PATCH /api/executions/{id}/scheduled-date (Feature
 * 15) — the documented body {@code {"scheduledDate": "..."}}. Only the new
 * date is required; {@code version} is optional and follows the optimistic
 * locking convention of the PUT update (409 on stale when provided, like any
 * other modification; the entity's {@code @Version} still rejects true
 * concurrent writes at flush). The J-5 business rule itself is validated by
 * the service against the CURRENT service date, never by the client.
 */
public record UpdateScheduledDateRequest(
        @NotNull LocalDate scheduledDate,
        Long version) {
}
