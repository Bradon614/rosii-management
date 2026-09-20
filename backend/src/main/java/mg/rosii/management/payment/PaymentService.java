package mg.rosii.management.payment;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import mg.rosii.management.payment.dto.CreatePaymentRequest;
import mg.rosii.management.payment.dto.PaymentResponse;
import mg.rosii.management.payment.dto.UpdatePaymentRequest;
import mg.rosii.management.proposal.Proposal;
import mg.rosii.management.proposal.ProposalRepository;
import mg.rosii.management.proposal.ProposalStatus;

import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Payment/deposit business logic (Feature 08): records money actually received
 * for an accepted proposal and exposes the derived financial situation.
 *
 * <p>Simple by design: no invoice, receipt, refund, credit or bank
 * reconciliation. Payments exist only for ACCEPTED proposals, are soft-deleted
 * (never hard-deleted) and never push the paid total above the proposal total
 * (409). Overpaying the requested deposit is explicitly allowed.
 */
@org.springframework.stereotype.Service
public class PaymentService {

    private final PaymentRepository payments;
    private final ProposalRepository proposals;

    public PaymentService(PaymentRepository payments, ProposalRepository proposals) {
        this.payments = payments;
        this.proposals = proposals;
    }

    @Transactional
    public PaymentResponse create(CreatePaymentRequest request) {
        Proposal proposal = findAcceptedProposal(request.proposalId());
        checkNotOverTotal(proposal, request.amount(), null);
        Payment payment = new Payment();
        payment.setProposal(proposal);
        payment.setAmount(request.amount());
        payment.setMethod(request.method());
        payment.setPaymentDate(request.paymentDate());
        payment.setReference(trimToNull(request.reference()));
        payment.setNotes(trimToNull(request.notes()));
        return PaymentResponse.from(payments.saveAndFlush(payment));
    }

    @Transactional(readOnly = true)
    public PaymentResponse get(UUID id) {
        return PaymentResponse.from(findActive(id));
    }

    /** Lists non-deleted payments with optional combined filters (newest first). */
    @Transactional(readOnly = true)
    public List<PaymentResponse> list(UUID proposalId, PaymentMethod method, LocalDate paymentDate) {
        return payments.findMatching(proposalId, method, paymentDate).stream()
                .map(PaymentResponse::from)
                .toList();
    }

    @Transactional
    public PaymentResponse update(UUID id, UpdatePaymentRequest request) {
        Payment payment = findActive(id);
        if (request.version() != payment.getVersion()) {
            throw conflict("payment was modified concurrently; reload with the current version and retry");
        }
        checkNotOverTotal(payment.getProposal(), request.amount(), payment);
        payment.setAmount(request.amount());
        payment.setMethod(request.method());
        payment.setPaymentDate(request.paymentDate());
        payment.setReference(trimToNull(request.reference()));
        payment.setNotes(trimToNull(request.notes()));
        // Flush so the response carries the incremented @Version, not the stale one.
        return PaymentResponse.from(payments.saveAndFlush(payment));
    }

    /** Soft deletion: sets deletedAt; the payment leaves every total. */
    @Transactional
    public void delete(UUID id) {
        findActive(id).markDeleted();
    }

    private Payment findActive(UUID id) {
        return payments.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "payment not found"));
    }

    /** A payment can only be recorded for an ACCEPTED proposal. */
    private Proposal findAcceptedProposal(UUID proposalId) {
        Proposal proposal = proposals.findByIdAndDeletedAtIsNull(proposalId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "proposal not found"));
        if (proposal.getStatus() != ProposalStatus.ACCEPTED) {
            throw conflict("payments can only be recorded for an ACCEPTED proposal");
        }
        return proposal;
    }

    /**
     * Refuses a payment that would push the paid total above the proposal total
     * (409). {@code replaced} is the payment being updated, excluded from the
     * current paid total. Overpaying the requested deposit remains allowed.
     */
    private void checkNotOverTotal(Proposal proposal, BigDecimal newAmount, Payment replaced) {
        BigDecimal totalPaid = payments.sumActiveByProposalId(proposal.getId());
        if (replaced != null) {
            totalPaid = totalPaid.subtract(replaced.getAmount());
        }
        BigDecimal total = proposal.getTotalAmount();
        if (totalPaid.add(newAmount).compareTo(total) > 0) {
            throw conflict("payment would exceed the proposal total (" + total + "); already paid " + totalPaid);
        }
    }

    private static ResponseStatusException conflict(String reason) {
        return new ResponseStatusException(HttpStatus.CONFLICT, reason);
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
