package mg.rosii.management.paymentreceipt;

import java.util.UUID;

import jakarta.validation.Validation;
import jakarta.validation.Validator;

import mg.rosii.management.paymentreceipt.dto.CreatePaymentReceiptRequest;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pure Bean-Validation unit tests for the receipt request contract (no Spring
 * context, no database). The payload carries only paymentId: the number and
 * every snapshot field are backend-derived, so there is nothing else the client
 * could send. The workflow rules (existing active payment 404, one active
 * receipt per payment 409), REC-YYYY-NNNN numbering, immutability and soft
 * delete are service-level and covered by the integration tests.
 */
class PaymentReceiptRequestValidationTest {

    private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void validCreateRequestHasNoViolations() {
        assertThat(VALIDATOR.validate(new CreatePaymentReceiptRequest(UUID.randomUUID()))).isEmpty();
    }

    /** paymentId is mandatory: 400 when missing (nothing is created). */
    @Test
    void missingPaymentIdIsRejected() {
        assertThat(VALIDATOR.validate(new CreatePaymentReceiptRequest(null)))
                .anySatisfy(v -> assertThat(v.getPropertyPath()).hasToString("paymentId"));
    }
}