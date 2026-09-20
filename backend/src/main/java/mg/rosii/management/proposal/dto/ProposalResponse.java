package mg.rosii.management.proposal.dto;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import mg.rosii.management.proposal.Proposal;
import mg.rosii.management.proposal.ProposalStatus;

/**
 * Proposal representation. {@code totalAmount} (sum of line totals) is computed,
 * never stored. {@code version} is exposed so clients can supply it on
 * update/status change.
 */
public record ProposalResponse(
        UUID id,
        String number,
        UUID clientId,
        UUID demandId,
        ProposalStatus status,
        String title,
        OffsetDateTime sentAt,
        OffsetDateTime acceptedAt,
        OffsetDateTime refusedAt,
        OffsetDateTime cancelledAt,
        LocalDate validUntil,
        String notes,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        long version,
        List<ProposalLineResponse> lines,
        BigDecimal proposalTotal,
        BigDecimal requiredDeposit,
        OffsetDateTime requiredDepositUpdatedAt,
        BigDecimal totalPaid,
        BigDecimal remainingAmount,
        boolean depositReached) {

    /**
     * Builds the response from the proposal and its paid total. The financial
     * values are all derived (never stored): {@code remainingAmount} may be
     * negative only if a legacy overpayment existed, as new payments that would
     * exceed the proposal total are refused.
     */
    public static ProposalResponse from(Proposal proposal, BigDecimal totalPaid) {
        var lines = proposal.getLines().stream().map(ProposalLineResponse::from).toList();
        BigDecimal total = proposal.getTotalAmount();
        BigDecimal paid = totalPaid == null ? BigDecimal.ZERO.setScale(2) : totalPaid.setScale(2, RoundingMode.HALF_UP);
        BigDecimal deposit = proposal.getRequiredDeposit();
        return new ProposalResponse(
                proposal.getId(),
                proposal.getNumber(),
                proposal.getClient().getId(),
                proposal.getDemand().getId(),
                proposal.getStatus(),
                proposal.getTitle(),
                proposal.getSentAt(),
                proposal.getAcceptedAt(),
                proposal.getRefusedAt(),
                proposal.getCancelledAt(),
                proposal.getValidUntil(),
                proposal.getNotes(),
                proposal.getCreatedAt(),
                proposal.getUpdatedAt(),
                proposal.getVersion(),
                lines,
                total,
                deposit,
                proposal.getRequiredDepositUpdatedAt(),
                paid,
                total.subtract(paid).setScale(2, RoundingMode.HALF_UP),
                deposit != null && paid.compareTo(deposit) >= 0);
    }
}
