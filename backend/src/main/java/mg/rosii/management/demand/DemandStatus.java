package mg.rosii.management.demand;

/**
 * Lifecycle position of a demand in the ROSII sales funnel (Feature 06).
 *
 * <p>Deliberately NOT a state machine: the patronne may set any status at any
 * time to correct mistakes. No transition rules are enforced.
 *
 * <p>ACCEPTED means the client accepted the commercial proposal/quote — it does
 * NOT confirm any reservation; availability and reservations are later features.
 */
public enum DemandStatus {
    /** Nouvelle */
    NEW,
    /** En analyse */
    IN_ANALYSIS,
    /** Proposition en préparation */
    PROPOSAL_IN_PREPARATION,
    /** Devis envoyé */
    QUOTE_SENT,
    /** Acceptée */
    ACCEPTED,
    /** Refusée */
    REFUSED,
    /** Abandonnée */
    ABANDONED
}
