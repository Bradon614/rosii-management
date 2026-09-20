package mg.rosii.management.demand.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import mg.rosii.management.demand.BudgetType;
import mg.rosii.management.demand.DemandStatus;
import mg.rosii.management.demand.DemandType;

/**
 * Demand creation payload. The client must exist and be active (checked by the
 * service). Status is optional and defaults to NEW; budgetType is optional and
 * defaults to NONE. Cross-field budget consistency is validated by the
 * service (400 on violation, never silently repaired).
 *
 * <p>Lengths (documented API contract): location 500, notes 2000,
 * budgets numeric(14,2).
 */
public record CreateDemandRequest(
        @NotNull UUID clientId,
        @NotNull DemandType type,
        DemandStatus status,
        LocalDate requestedDate,
        @Min(1) Integer estimatedPeople,
        BudgetType budgetType,
        @DecimalMin("0.00") @Digits(integer = 12, fraction = 2) BigDecimal budgetMin,
        @DecimalMin("0.00") @Digits(integer = 12, fraction = 2) BigDecimal budgetMax,
        @Size(max = 500) String location,
        @Size(max = 2000) String notes,
        @Valid DemandEventDetailsRequest eventDetails) {
}
