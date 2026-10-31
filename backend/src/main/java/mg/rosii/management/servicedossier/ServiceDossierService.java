package mg.rosii.management.servicedossier;

import java.util.List;
import java.util.UUID;

import mg.rosii.management.client.dto.ClientResponse;
import mg.rosii.management.closure.ServiceClosure;
import mg.rosii.management.closure.ServiceClosureRepository;
import mg.rosii.management.closure.dto.ClosureResponse;
import mg.rosii.management.demand.dto.DemandResponse;
import mg.rosii.management.execution.Execution;
import mg.rosii.management.execution.ExecutionRepository;
import mg.rosii.management.execution.dto.ExecutionResponse;
import mg.rosii.management.invoice.InvoiceRepository;
import mg.rosii.management.invoice.dto.InvoiceResponse;
import mg.rosii.management.payment.Payment;
import mg.rosii.management.payment.PaymentRepository;
import mg.rosii.management.payment.dto.PaymentResponse;
import mg.rosii.management.paymentreceipt.PaymentReceiptRepository;
import mg.rosii.management.paymentreceipt.dto.PaymentReceiptResponse;
import mg.rosii.management.preparation.Preparation;
import mg.rosii.management.preparation.PreparationRepository;
import mg.rosii.management.preparation.dto.PreparationResponse;
import mg.rosii.management.proposal.Proposal;
import mg.rosii.management.proposal.ProposalRepository;
import mg.rosii.management.proposal.dto.ProposalResponse;
import mg.rosii.management.servicedossier.dto.ServiceDossierResponse;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Read-only assembly of the service dossier (Feature 17).
 *
 * <p>No state, no rule and no calculation is introduced: every section reuses
 * the owning domain's response factory, and the paid total comes from the same
 * repository aggregate the payment domain uses. The service only queries and
 * maps; it never writes.
 *
 * <p>Queries are constant in the number of sections: proposal (+ its lines,
 * client and demand through lazy loading inside this read-only transaction),
 * one payment list, one bulk receipt query, one bulk invoice query, one
 * preparation, one execution and one closure.
 */
@Service
@Transactional(readOnly = true)
public class ServiceDossierService {

    private final ProposalRepository proposals;
    private final PaymentRepository payments;
    private final PaymentReceiptRepository receipts;
    private final InvoiceRepository invoices;
    private final PreparationRepository preparations;
    private final ExecutionRepository executions;
    private final ServiceClosureRepository closures;

    public ServiceDossierService(ProposalRepository proposals,
            PaymentRepository payments,
            PaymentReceiptRepository receipts,
            InvoiceRepository invoices,
            PreparationRepository preparations,
            ExecutionRepository executions,
            ServiceClosureRepository closures) {
        this.proposals = proposals;
        this.payments = payments;
        this.receipts = receipts;
        this.invoices = invoices;
        this.preparations = preparations;
        this.executions = executions;
        this.closures = closures;
    }

    public ServiceDossierResponse get(UUID proposalId) {
        Proposal proposal = proposals.findByIdAndDeletedAtIsNull(proposalId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "proposal not found"));

        List<Payment> activePayments = payments.findMatching(proposalId, null, null);
        List<UUID> paymentIds = activePayments.stream().map(Payment::getId).toList();

        List<PaymentReceiptResponse> receiptResponses = paymentIds.isEmpty()
                ? List.of()
                : receipts.findByPaymentIdInAndDeletedAtIsNull(paymentIds).stream()
                        .map(PaymentReceiptResponse::from)
                        .toList();
        List<InvoiceResponse> invoiceResponses = paymentIds.isEmpty()
                ? List.of()
                : invoices.findByPaymentIdInAndDeletedAtIsNull(paymentIds).stream()
                        .map(InvoiceResponse::from)
                        .toList();

        Preparation preparation = preparations.findByProposalIdAndDeletedAtIsNull(proposalId).orElse(null);
        Execution execution = preparation == null ? null
                : executions.findByPreparationIdAndDeletedAtIsNull(preparation.getId()).orElse(null);
        ServiceClosure closure = preparation == null ? null
                : closures.findByPreparationIdAndDeletedAtIsNull(preparation.getId()).orElse(null);

        // Same aggregate as Features 08–10: all financial values on the proposal
        // section are derived by ProposalResponse.from(proposal, totalPaid).
        return new ServiceDossierResponse(
                ProposalResponse.from(proposal, payments.sumActiveByProposalId(proposalId)),
                ClientResponse.from(proposal.getClient()),
                DemandResponse.from(proposal.getDemand()),
                activePayments.stream().map(PaymentResponse::from).toList(),
                receiptResponses,
                invoiceResponses,
                preparation == null ? null : PreparationResponse.from(preparation),
                execution == null ? null : ExecutionResponse.from(execution),
                closure == null ? null : ClosureResponse.from(closure));
    }
}