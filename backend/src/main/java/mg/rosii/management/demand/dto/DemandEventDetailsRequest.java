package mg.rosii.management.demand.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Event-specific details, optional on any demand. When present, eventType is
 * required (trimmed, max 100). Service-request flags are nullable Booleans:
 * true = requested, false = declined, null = not specified yet.
 */
public record DemandEventDetailsRequest(
        @NotBlank @Size(max = 100) String eventType,
        Boolean hallNeeded,
        @Size(max = 200) String desiredHall,
        Boolean cateringRequested,
        Boolean decorationRequested,
        Boolean floristRequested,
        Boolean equipmentRentalRequested,
        Boolean transportRequested,
        @Size(max = 500) String theme,
        @Size(max = 2000) String notes) {
}
