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
 * Demand update payload: all editable fields plus the expected {@code version}
 * for optimistic locking (409 on stale). A null {@code eventDetails} removes
 * the existing event details (orphan removal); a provided object replaces them.
 */
public record UpdateDemandRequest(
        @NotNull UUID clientId,
        @NotNull DemandType type,
        @NotNull DemandStatus status,
        LocalDate requestedDate,
        @Min(1) Integer estimatedPeople,
        BudgetType budgetType,
        @DecimalMin("0.00") @Digits(integer = 12, fraction = 2) BigDecimal budgetMin,
        @DecimalMin("0.00") @Digits(integer = 12, fraction = 2) BigDecimal budgetMax,
        @Size(max = 500) String location,
        @Size(max = 2000) String notes,
        @Valid DemandEventDetailsRequest eventDetails,
        @NotNull Long version) {
}
