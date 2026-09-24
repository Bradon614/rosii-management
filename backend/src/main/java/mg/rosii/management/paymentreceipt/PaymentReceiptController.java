package mg.rosii.management.paymentreceipt;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import jakarta.validation.Valid;

import mg.rosii.management.paymentreceipt.dto.CreatePaymentReceiptRequest;
import mg.rosii.management.paymentreceipt.dto.PaymentReceiptResponse;

import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Payment receipt API. Requires authentication via the existing security config
 * (no permitAll additions); V1 single-role PATRONNE. Only the endpoints of the
 * real receipt scope exist: create, read (by id or filtered list) and soft
 * delete. There is deliberately NO PUT: a receipt is an immutable historical
 * document (any PUT on /{id} is answered 405 by the framework since only GET and
 * DELETE are mapped). No PDF or document generation happens here.
 */
@RestController
@RequestMapping("/api/payment-receipts")
public class PaymentReceiptController {

    private final PaymentReceiptService receiptService;

    public PaymentReceiptController(PaymentReceiptService receiptService) {
        this.receiptService = receiptService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PaymentReceiptResponse create(@Valid @RequestBody CreatePaymentReceiptRequest request) {
        return receiptService.create(request);
    }

    /** Optional combined filters: /api/payment-receipts?paymentId=&receiptNumber= */
    @GetMapping
    public List<PaymentReceiptResponse> list(
            @RequestParam(required = false) UUID paymentId,
            @RequestParam(required = false) String receiptNumber) {
        return receiptService.list(paymentId, receiptNumber);
    }

    @GetMapping("/{id}")
    public PaymentReceiptResponse get(@PathVariable UUID id) {
        return receiptService.get(id);
    }

    /** Soft delete: the receipt disappears from the API but the row and number are kept. */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        receiptService.delete(id);
    }

    /** True concurrent modification caught by @Version at flush — clean 409. */
    @ExceptionHandler(OptimisticLockingFailureException.class)
    public ResponseEntity<Map<String, String>> handleConcurrentModification(
            OptimisticLockingFailureException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", "payment receipt was modified concurrently; reload and retry"));
    }
}