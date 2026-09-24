package mg.rosii.management.closure;

/**
 * Final state of a service closure (Feature 11). Unlike {@code ExecutionStatus},
 * this is deliberately NOT a state machine: the status is chosen once at
 * creation (default {@link #COMPLETED}) and an active closure is definitive —
 * {@code PUT} always answers 409 and only soft delete is allowed.
 *
 * <p>No other status exists: the business rules define only the normal closure
 * and the closure despite a noted issue.
 */
public enum ClosureStatus {
    /** Terminée sans problème: the standard closure, default at creation. */
    COMPLETED,
    /** Clôturée avec un problème: closed by the patronne despite an issue. */
    WITH_ISSUE
}