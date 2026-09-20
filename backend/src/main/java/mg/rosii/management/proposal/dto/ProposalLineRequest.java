package mg.rosii.management.proposal.dto;

import java.math.BigDecimal;
import java.util.UUID;

import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * One proposal line payload. {@code serviceId} is optional: a line may be
 * free-form. The backend uses the referenced service only to default the
 * snapshot values; the provided description/unit/unitPrice always win.
 */
public record ProposalLineRequest(
        UUID serviceId,
        @NotBlank @Size(max = 500) String description,
        @NotBlank @Size(max = 50) String unit,
        @NotNull @DecimalMin(value = "0.0", inclusive = false) @Digits(integer = 11, fraction = 3) BigDecimal quantity,
        @NotNull @DecimalMin("0.00") @Digits(integer = 12, fraction = 2) BigDecimal unitPrice,
        @Size(max = 2000) String notes) {
}
