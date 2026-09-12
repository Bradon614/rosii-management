package mg.rosii.management.service;

/**
 * ROSII commercial service categories (Feature 05 catalogue).
 *
 * <p>Fixed business list — no subcategories, no invented extras.
 * Stored as a string (EnumType.STRING) per the project conventions.
 */
public enum ServiceCategory {
    /** Traiteur */
    CATERING,
    /** Décoration */
    DECORATION,
    /** Fleuriste */
    FLORIST,
    /** Transport */
    TRANSPORT,
    /** Location de matériel */
    EQUIPMENT_RENTAL,
    /** Location de salle */
    HALL_RENTAL,
    /** Location de voiture */
    CAR_RENTAL,
    /** Construction */
    CONSTRUCTION,
    /** Immobilier */
    REAL_ESTATE,
    /** Autre */
    OTHER
}
