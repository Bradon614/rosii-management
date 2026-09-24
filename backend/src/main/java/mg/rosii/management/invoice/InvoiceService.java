package mg.rosii.management.invoice;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import mg.rosii.management.invoice.dto.CreateInvoiceRequest;
import mg.rosii.management.invoice.dto.InvoiceResponse;
import mg.rosii.management.payment.Payment;
import mg.rosii.management.payment.PaymentRepository;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Invoice business logic (Feature 13): one invoice per payment, with a
 * backend-generated unique number and a frozen financial snapshot.
 *
 * <p>Creation re-checks the rules: the payment exists and is active (404) and no
 * active invoice exists for it yet (409 — enforced for real by the partial
 * unique index of V12). A billable payment always has amount &gt; 0 (Feature 08
 * validates it at payment creation), so every existing active payment can be
 * invoiced. The service then derives everything else from the payment — amount,
 * method, date, reference — without ever modifying the payment, generates
 * FAC-YYYY-NNNN from the highest number of the current year over ALL rows
 * (soft-deleted included: numbers are never reused) and stamps issuedAt.
 *
 * <p>An invoice is a financial historical document: there is no update operation
 * at all (no PUT endpoint exists), and only soft delete is allowed, which
 * releases the per-payment slot while keeping the row and its number for
 * history. No PDF or document generation happens here.
 */
@org.springframework.stereotype.Service
public class InvoiceService {

    private final InvoiceRepository invoices;
    private final PaymentRepository payments;

    public InvoiceService(InvoiceRepository invoices, PaymentRepository payments) {
        this.invoices = invoices;
        this.payments = payments;
    }

    @Transactional
    public InvoiceResponse create(CreateInvoiceRequest request) {
        // 1./2. The payment must exist and be active (404); amount > 0 is
        // guaranteed by Feature 08 validation on every persisted payment.
        Payment payment = payments.findByIdAndDeletedAtIsNull(request.paymentId())
                .orElseThrow(() -> notFound("payment not found"));
        // 3. At most one active invoice per payment (409).
        if (invoices.existsByPaymentIdAndDeletedAtIsNull(payment.getId())) {
            throw conflict("an invoice already exists for this payment");
        }
        // 4.-6. Snapshot every payment field at issuance; the payment is only read.
        Invoice invoice = new Invoice();
        invoice.setPayment(payment);
        invoice.setAmount(payment.getAmount());
        invoice.setPaymentMethod(payment.getMethod());
        invoice.setPaymentDate(payment.getPaymentDate());
        invoice.setPaymentReference(payment.getReference());
        // 5. Backend-generated number — never accepted from the client.
        invoice.setInvoiceNumber(nextInvoiceNumber());
        // 7. Server-stamped emission date.
        invoice.setIssuedAt(OffsetDateTime.now());
        try {
            return InvoiceResponse.from(invoices.saveAndFlush(invoice));
        } catch (DataIntegrityViolationException e) {
            // The unique indexes are the final guard against concurrent duplicates.
            throw conflict("an invoice already exists for this payment");
        }
    }

    @Transactional(readOnly = true)
    public InvoiceResponse get(UUID id) {
        return InvoiceResponse.from(findActive(id));
    }

    /** Optional combined filters: paymentId and/or invoiceNumber; soft-deleted never appear. */
    @Transactional(readOnly = true)
    public List<InvoiceResponse> list(UUID paymentId, String invoiceNumber) {
        return invoices.findMatching(paymentId, invoiceNumber).stream()
                .map(InvoiceResponse::from)
                .toList();
    }

    /** Soft deletion: sets deletedAt; the row (and its number) is kept, the slot released. */
    @Transactional
    public void delete(UUID id) {
        findActive(id).markDeleted();
    }

    /**
     * FAC-YYYY-NNNN for the current year: highest existing number of the year
     * (over ALL rows, deleted included, so a deleted number is never reused)
     * plus one; 0001 when the year has none yet.
     */
    private String nextInvoiceNumber() {
        String prefix = "FAC-%04d-".formatted(LocalDate.now().getYear());
        String highest = invoices.findMaxInvoiceNumberStartingWith(prefix);
        int next = 1;
        if (highest != null && highest.length() > prefix.length()) {
            next = Integer.parseInt(highest.substring(prefix.length())) + 1;
        }
        return prefix + "%04d".formatted(next);
    }

    private Invoice findActive(UUID id) {
        return invoices.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> notFound("invoice not found"));
    }

    private static ResponseStatusException notFound(String reason) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, reason);
    }

    private static ResponseStatusException conflict(String reason) {
        return new ResponseStatusException(HttpStatus.CONFLICT, reason);
    }
}