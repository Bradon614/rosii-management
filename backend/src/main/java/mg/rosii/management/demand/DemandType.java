package mg.rosii.management.demand;

/**
 * What kind of need the client expressed (Feature 06).
 *
 * <p>Fixed business list — no subtypes. Event-specific kinds
 * (Mariage, Anniversaire, ...) are free-text on DemandEventDetails.eventType,
 * not demand types.
 */
public enum DemandType {
    /** General event needing coordination (details in DemandEventDetails). */
    EVENT,
    CATERING,
    DECORATION,
    FLORIST,
    EQUIPMENT_RENTAL,
    TRANSPORT,
    CAR_RENTAL,
    CONSTRUCTION,
    REAL_ESTATE,
    OTHER
}
