package mg.rosii.management.dashboard;

import com.fasterxml.jackson.annotation.JsonValue;

/**
 * The six real events the dashboard can display, newest first after sorting.
 *
 * <p>The constant names are internal; the JSON value is the wire contract the
 * desktop application already knows (see {@code DashboardActivityKind} in
 * {@code desktop/src/types/api.ts}). No new event kind may be introduced here
 * without a matching event that really exists in the database.
 */
public enum DashboardActivityKind {

    /** A demand was registered. */
    DEMAND_CREATED("demand_created"),
    /** A proposal was created (always present, whatever its status). */
    PROPOSAL_CREATED("proposal_created"),
    /** A proposal was accepted (uses the real {@code acceptedAt} instant). */
    PROPOSAL_ACCEPTED("proposal_accepted"),
    /** A payment was recorded. */
    PAYMENT_RECORDED("payment_recorded"),
    /** An execution was completed (uses the real {@code completedAt} instant). */
    EXECUTION_COMPLETED("execution_completed"),
    /** A service was closed (uses the real {@code closedAt} instant). */
    CLOSURE_CLOSED("closure_closed");

    private final String wireValue;

    DashboardActivityKind(String wireValue) {
        this.wireValue = wireValue;
    }

    /** The stable JSON value of this kind. */
    @JsonValue
    public String wireValue() {
        return wireValue;
    }
}
