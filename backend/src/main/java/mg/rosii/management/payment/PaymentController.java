package mg.rosii.management.payment;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import jakarta.validation.Valid;

import mg.rosii.management.payment.dto.CreatePaymentRequest;
import mg.rosii.management.payment.dto.PaymentResponse;
import mg.rosii.management.payment.dto.UpdatePaymentRequest;

import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Payment API. Requires authentication via the existing security config (no
 * permitAll additions); V1 single-role PATRONNE.
 */
@RestController
@RequestMapping("/api/payments")
public class PaymentController {

    private final PaymentService paymentService;

    public PaymentController(PaymentService paymentService) {
        this.paymentService = paymentService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PaymentResponse create(@Valid @RequestBody CreatePaymentRequest request) {
        return paymentService.create(request);
    }

    @GetMapping
    public List<PaymentResponse> list(
            @RequestParam(required = false) UUID proposalId,
            @RequestParam(required = false) PaymentMethod method,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate paymentDate) {
        return paymentService.list(proposalId, method, paymentDate);
    }

    @GetMapping("/{id}")
    public PaymentResponse get(@PathVariable UUID id) {
        return paymentService.get(id);
    }

    @PutMapping("/{id}")
    public PaymentResponse update(@PathVariable UUID id, @Valid @RequestBody UpdatePaymentRequest request) {
        return paymentService.update(id, request);
    }

    /** Soft delete: the payment leaves the totals but the row is kept. */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        paymentService.delete(id);
    }

    /** True concurrent update caught by @Version at flush — clean 409. */
    @ExceptionHandler(OptimisticLockingFailureException.class)
    public ResponseEntity<Map<String, String>> handleConcurrentModification(
            OptimisticLockingFailureException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", "payment was modified concurrently; reload and retry"));
    }
}
