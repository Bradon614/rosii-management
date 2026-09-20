package mg.rosii.management.proposal;

/**
 * Lifecycle position of a proposal/quote in the ROSII sales flow (Feature 07).
 *
 * <p>Unlike {@code DemandStatus}, this IS a strict state machine: a proposal is
 * a commercial document, so only the transitions defined in
 * {@link mg.rosii.management.proposal.ProposalService} are allowed. Terminal
 * states (ACCEPTED, REFUSED, EXPIRED, CANCELLED) cannot transition again.
 *
 * <p>ACCEPTED records the client's agreement only — it creates no project,
 * reservation, payment or anything operational.
 */
public enum ProposalStatus {
    /** Brouillon: fully editable, not yet shown to the client. */
    DRAFT,
    /** Devis envoyé: content frozen, awaiting the client's decision. */
    SENT,
    /** Devis accepté: client agreed (terminal, commercial only). */
    ACCEPTED,
    /** Devis refusé: client declined (terminal). */
    REFUSED,
    /** Devis expiré: validUntil passed before a decision (terminal). */
    EXPIRED,
    /** Annulé: withdrawn by the patronne (terminal). */
    CANCELLED
}
