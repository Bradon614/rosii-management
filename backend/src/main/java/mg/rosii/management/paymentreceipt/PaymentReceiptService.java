package mg.rosii.management.paymentreceipt;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import mg.rosii.management.payment.Payment;
import mg.rosii.management.payment.PaymentRepository;
import mg.rosii.management.paymentreceipt.dto.CreatePaymentReceiptRequest;
import mg.rosii.management.paymentreceipt.dto.PaymentReceiptResponse;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Receipt business logic (Feature 12): a justificatif per payment, with a
 * backend-generated unique number and a frozen snapshot of the payment.
 *
 * <p>Creation re-checks the rules: the payment exists and is active (404) and no
 * active receipt exists for it yet (409 — enforced for real by the partial
 * unique index of V11). It then derives everything else from the payment —
 * amount, method, date, reference — without ever modifying the payment, and
 * generates REC-YYYY-NNNN from the highest number of the current year over ALL
 * rows (soft-deleted included: numbers are never reused).
 *
 * <p>A receipt is a historical document: there is no update operation at all (no
 * PUT endpoint exists), and only soft delete is allowed, which releases the
 * per-payment slot while keeping the row and its number for history.
 */
@org.springframework.stereotype.Service
public class PaymentReceiptService {

    private final PaymentReceiptRepository receipts;
    private final PaymentRepository payments;

    public PaymentReceiptService(PaymentReceiptRepository receipts, PaymentRepository payments) {
        this.receipts = receipts;
        this.payments = payments;
    }

    @Transactional
    public PaymentReceiptResponse create(CreatePaymentReceiptRequest request) {
        // 1./2. The payment must exist and be active (404).
        Payment payment = payments.findByIdAndDeletedAtIsNull(request.paymentId())
                .orElseThrow(() -> notFound("payment not found"));
        // 3. At most one active receipt per payment (409).
        if (receipts.existsByPaymentIdAndDeletedAtIsNull(payment.getId())) {
            throw conflict("a receipt already exists for this payment");
        }
        // 4.-6. Snapshot every payment field at issuance; the payment is only read.
        PaymentReceipt receipt = new PaymentReceipt();
        receipt.setPayment(payment);
        receipt.setAmount(payment.getAmount());
        receipt.setPaymentMethod(payment.getMethod());
        receipt.setPaymentDate(payment.getPaymentDate());
        receipt.setPaymentReference(payment.getReference());
        // 5. Backend-generated number — never accepted from the client.
        receipt.setReceiptNumber(nextReceiptNumber());
        try {
            return PaymentReceiptResponse.from(receipts.saveAndFlush(receipt));
        } catch (DataIntegrityViolationException e) {
            // The unique indexes are the final guard against concurrent duplicates.
            throw conflict("a receipt already exists for this payment");
        }
    }

    @Transactional(readOnly = true)
    public PaymentReceiptResponse get(UUID id) {
        return PaymentReceiptResponse.from(findActive(id));
    }

    /** Optional combined filters: paymentId and/or receiptNumber; soft-deleted never appear. */
    @Transactional(readOnly = true)
    public List<PaymentReceiptResponse> list(UUID paymentId, String receiptNumber) {
        return receipts.findMatching(paymentId, receiptNumber).stream()
                .map(PaymentReceiptResponse::from)
                .toList();
    }

    /** Soft deletion: sets deletedAt; the row (and its number) is kept, the slot released. */
    @Transactional
    public void delete(UUID id) {
        findActive(id).markDeleted();
    }

    /**
     * REC-YYYY-NNNN for the current year: highest existing number of the year
     * (over ALL rows, deleted included, so a deleted number is never reused)
     * plus one; 0001 when the year has none yet.
     */
    private String nextReceiptNumber() {
        String prefix = "REC-%04d-".formatted(LocalDate.now().getYear());
        String highest = receipts.findMaxReceiptNumberStartingWith(prefix);
        int next = 1;
        if (highest != null && highest.length() > prefix.length()) {
            next = Integer.parseInt(highest.substring(prefix.length())) + 1;
        }
        return prefix + "%04d".formatted(next);
    }

    private PaymentReceipt findActive(UUID id) {
        return receipts.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> notFound("payment receipt not found"));
    }

    private static ResponseStatusException notFound(String reason) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, reason);
    }

    private static ResponseStatusException conflict(String reason) {
        return new ResponseStatusException(HttpStatus.CONFLICT, reason);
    }
}