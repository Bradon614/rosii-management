package mg.rosii.management.service.dto;

import java.math.BigDecimal;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import mg.rosii.management.service.ServiceCategory;

/**
 * Service update payload: the editable content fields plus the expected
 * {@code version} for optimistic locking (409 on stale writes).
 *
 * <p>The {@code active} flag is intentionally not editable here — it is managed
 * through {@code PATCH /api/services/{id}/active}, keeping "offered or not"
 * separate from content edits. id, timestamps, deletedAt are never writable.
 */
public record UpdateServiceRequest(
        @NotBlank @Size(max = 200) String name,
        @NotNull ServiceCategory category,
        @Size(max = 2000) String description,
        @NotBlank @Size(max = 50) String defaultUnit,
        @NotNull @DecimalMin("0.00") @Digits(integer = 12, fraction = 2) BigDecimal referencePrice,
        @NotNull Long version) {
}
