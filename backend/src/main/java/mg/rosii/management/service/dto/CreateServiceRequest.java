package mg.rosii.management.service.dto;

import java.math.BigDecimal;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import mg.rosii.management.service.ServiceCategory;

/**
 * Service creation payload.
 *
 * <p>Limits (documented API contract): name 200, defaultUnit 50,
 * description 2000, referencePrice up to 12 integer digits and 2 decimals
 * (matching the numeric(14,2) column). Price is descriptive metadata only —
 * no pricing calculation happens here.
 */
public record CreateServiceRequest(
        @NotBlank @Size(max = 200) String name,
        @NotNull ServiceCategory category,
        @Size(max = 2000) String description,
        @NotBlank @Size(max = 50) String defaultUnit,
        @NotNull @DecimalMin("0.00") @Digits(integer = 12, fraction = 2) BigDecimal referencePrice,
        // Optional; absent means active (catalogue default).
        Boolean active) {
}
