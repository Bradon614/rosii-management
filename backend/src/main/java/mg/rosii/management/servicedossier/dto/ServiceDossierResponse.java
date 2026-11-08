package mg.rosii.management.servicedossier.dto;

import java.util.List;

import mg.rosii.management.client.dto.ClientResponse;
import mg.rosii.management.closure.dto.ClosureResponse;
import mg.rosii.management.demand.dto.DemandResponse;
import mg.rosii.management.execution.dto.ExecutionResponse;
import mg.rosii.management.invoice.dto.InvoiceResponse;
import mg.rosii.management.payment.dto.PaymentResponse;
import mg.rosii.management.paymentreceipt.dto.PaymentReceiptResponse;
import mg.rosii.management.preparation.dto.PreparationResponse;
import mg.rosii.management.proposal.dto.ProposalResponse;

/**
 * Read-only recap of one commercial case around a proposal (Feature 17).
 *
 * <p>Every section embeds the domain's own response DTO, so all values —
 * including the financial summary — are produced by the existing calculations
 * and never recomputed here. The financial summary lives on
 * {@code proposal}: {@code proposalTotal}, {@code requiredDeposit},
 * {@code totalPaid}, {@code remainingAmount} and {@code depositReached}.
 *
 * <p>Sections that do not exist yet (not started / no payments) are
 * {@code null} or empty, never an error. {@code receipts} and {@code invoices}
 * carry the ids and numbers needed to fetch the existing PDF documents through
 * their own {@code /pdf} endpoints; this feature never generates or modifies a
 * document.
 *
 * <p>Soft-deleted proposals, payments, receipts, invoices, preparations,
 * executions and closures never appear. When the preparation is soft-deleted,
 * its dependent execution and closure are not reported either.
 */
public record ServiceDossierResponse(
        ProposalResponse proposal,
        ClientResponse client,
        DemandResponse demand,
        List<PaymentResponse> payments,
        List<PaymentReceiptResponse> receipts,
        List<InvoiceResponse> invoices,
        PreparationResponse preparation,
        ExecutionResponse execution,
        ClosureResponse closure) {
}