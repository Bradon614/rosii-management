package mg.rosii.management.service.dto;

import jakarta.validation.constraints.NotNull;

/** Desired active state for {@code PATCH /api/services/{id}/active}. */
public record SetActiveRequest(@NotNull Boolean active) {
}
