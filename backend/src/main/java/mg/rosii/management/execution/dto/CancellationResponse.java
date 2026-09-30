package mg.rosii.management.execution.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

import mg.rosii.management.execution.Execution;
import mg.rosii.management.execution.ExecutionStatus;

/**
 * Cancellation result (Feature 15): the cancelled execution plus the derived
 * cancellation amounts. {@code proposalTotal} is the total of the ACCEPTED
 * proposal (never stored, re-derived from its lines); {@code retainedAmount}
 * is 25% of that total; {@code potentialRefundAmount} is what was paid minus
 * the retention, floored at 0 — it is an INDICATION, never a refund: no
 * payment movement is created and no debt/credit is recorded. The historical
 * payments, receipts and invoices are never touched by a cancellation.
 */
public record CancellationResponse(
        UUID id,
        ExecutionStatus status,
        OffsetDateTime cancelledAt,
        String cancellationReason,
        BigDecimal proposalTotal,
        BigDecimal totalPaid,
        BigDecimal retainedAmount,
        BigDecimal potentialRefundAmount) {

    public static CancellationResponse from(Execution execution, BigDecimal proposalTotal,
            BigDecimal totalPaid, BigDecimal retainedAmount, BigDecimal potentialRefundAmount) {
        return new CancellationResponse(
                execution.getId(),
                execution.getStatus(),
                execution.getCancelledAt(),
                execution.getCancellationReason(),
                proposalTotal,
                totalPaid,
                retainedAmount,
                potentialRefundAmount);
    }
}
