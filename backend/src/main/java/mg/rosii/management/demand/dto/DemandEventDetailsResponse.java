package mg.rosii.management.demand.dto;

import mg.rosii.management.demand.DemandEventDetails;

/** Event details representation; nullable Booleans keep the requested/declined/unspecified distinction. */
public record DemandEventDetailsResponse(
        String eventType,
        Boolean hallNeeded,
        String desiredHall,
        Boolean cateringRequested,
        Boolean decorationRequested,
        Boolean floristRequested,
        Boolean equipmentRentalRequested,
        Boolean transportRequested,
        String theme,
        String notes) {

    public static DemandEventDetailsResponse from(DemandEventDetails details) {
        return new DemandEventDetailsResponse(
                details.getEventType(),
                details.getHallNeeded(),
                details.getDesiredHall(),
                details.getCateringRequested(),
                details.getDecorationRequested(),
                details.getFloristRequested(),
                details.getEquipmentRentalRequested(),
                details.getTransportRequested(),
                details.getTheme(),
                details.getNotes());
    }
}
