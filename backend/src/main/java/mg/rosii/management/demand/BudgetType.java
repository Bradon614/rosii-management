package mg.rosii.management.demand;

/**
 * How the client expressed their budget (Feature 06). Consistency rules for
 * budgetMin/budgetMax per type are enforced in DemandService (400 on violation).
 */
public enum BudgetType {
    /** No budget communicated: both amounts must be null. */
    NONE,
    /** A single amount: budgetMin == budgetMax. */
    EXACT,
    /** A bracket: budgetMin < budgetMax. */
    RANGE
}
