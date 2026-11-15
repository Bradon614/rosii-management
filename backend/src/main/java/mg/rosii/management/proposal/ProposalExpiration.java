package mg.rosii.management.proposal;

import java.time.LocalDate;

/**
 * The single definition of the lazy proposal expiration rule.
 *
 * <p>A proposal is never written as {@code EXPIRED} by a scheduler: it stays
 * stored as {@code SENT} and is reported as {@code EXPIRED} at read time once
 * its {@code validUntil} is already past. Every read path that has to report a
 * proposal status applies this predicate, so the rule cannot drift between the
 * proposal endpoints and the dashboard aggregate.
 *
 * <p>The comparison is exactly the historical one: only a stored {@code SENT}
 * status can expire, {@code validUntil} must be present, and it must be strictly
 * {@code before} today — a validity that ends today is still valid. Nothing is
 * ever written: the storage keeps {@code SENT} and the callers only change the
 * value they report.
 */
public final class ProposalExpiration {

    private ProposalExpiration() {
    }

    /** True when the given stored values describe a proposal past its validity. */
    public static boolean isPastValidity(ProposalStatus status, LocalDate validUntil, LocalDate today) {
        return status == ProposalStatus.SENT
                && validUntil != null
                && validUntil.isBefore(today);
    }

    /** The status the API reports for the given stored values. */
    public static ProposalStatus effectiveStatus(ProposalStatus status, LocalDate validUntil, LocalDate today) {
        return isPastValidity(status, validUntil, today) ? ProposalStatus.EXPIRED : status;
    }

    /** Applies the rule to an entity, exactly as the read endpoints do. */
    public static void apply(Proposal proposal, LocalDate today) {
        if (isPastValidity(proposal.getStatus(), proposal.getValidUntil(), today)) {
            proposal.setStatus(ProposalStatus.EXPIRED);
        }
    }
}
