package mg.rosii.management.execution;

/**
 * Lifecycle position of an execution (Feature 10). Like {@code ProposalStatus},
 * this IS a strict state machine: an execution is operational, so only the
 * transitions defined in {@link ExecutionService} are allowed
 * ({@code PLANNED -> IN_PROGRESS -> COMPLETED}, plus cancellation from
 * {@code PLANNED} or {@code IN_PROGRESS}).
 *
 * <p>Terminal states (COMPLETED, CANCELLED) cannot transition again, and their
 * operational information can no longer be modified.
 */
public enum ExecutionStatus {
    /** Prévue: the preparation has an execution, operational info still fully editable. */
    PLANNED,
    /** En cours: started (startedAt stamped); only location/notes stay editable. */
    IN_PROGRESS,
    /** Terminée: finished (completedAt stamped; terminal, no further modification). */
    COMPLETED,
    /** Annulée: cancelled from PLANNED or IN_PROGRESS (cancelledAt stamped; terminal). */
    CANCELLED
}