package mg.rosii.management.demand.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

import mg.rosii.management.demand.BudgetType;
import mg.rosii.management.demand.Demand;
import mg.rosii.management.demand.DemandStatus;
import mg.rosii.management.demand.DemandType;

/**
 * Demand representation. {@code clientName} is a read-only convenience for
 * lists (the client remains referenced, not duplicated). {@code version} is
 * exposed so clients can supply it on update.
 */
public record DemandResponse(
        UUID id,
        UUID clientId,
        String clientName,
        DemandType type,
        DemandStatus status,
        LocalDate requestedDate,
        Integer estimatedPeople,
        BudgetType budgetType,
        BigDecimal budgetMin,
        BigDecimal budgetMax,
        String location,
        String notes,
        DemandEventDetailsResponse eventDetails,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        long version) {

    public static DemandResponse from(Demand demand) {
        return new DemandResponse(
                demand.getId(),
                demand.getClient().getId(),
                demand.getClient().getName(),
                demand.getType(),
                demand.getStatus(),
                demand.getRequestedDate(),
                demand.getEstimatedPeople(),
                demand.getBudgetType(),
                demand.getBudgetMin(),
                demand.getBudgetMax(),
                demand.getLocation(),
                demand.getNotes(),
                demand.getEventDetails() == null ? null : DemandEventDetailsResponse.from(demand.getEventDetails()),
                demand.getCreatedAt(),
                demand.getUpdatedAt(),
                demand.getVersion());
    }
}
