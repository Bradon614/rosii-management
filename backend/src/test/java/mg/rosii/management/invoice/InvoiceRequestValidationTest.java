package mg.rosii.management.invoice;

import java.util.UUID;

import jakarta.validation.Validation;
import jakarta.validation.Validator;

import mg.rosii.management.invoice.dto.CreateInvoiceRequest;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pure Bean-Validation unit tests for the invoice request contract (no Spring
 * context, no database). The payload carries only paymentId: the number,
 * issuedAt and every snapshot field are backend-derived, so there is nothing
 * else the client could send (no financial data is ever accepted). The
 * workflow rules (existing active payment 404, one active invoice per payment
 * 409), FAC-YYYY-NNNN numbering, immutability (no PUT) and soft delete are
 * service-level and covered by the integration tests.
 */
class InvoiceRequestValidationTest {

    private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void validCreateRequestHasNoViolations() {
        assertThat(VALIDATOR.validate(new CreateInvoiceRequest(UUID.randomUUID()))).isEmpty();
    }

    /** paymentId is mandatory: 400 when missing (nothing is created). */
    @Test
    void missingPaymentIdIsRejected() {
        assertThat(VALIDATOR.validate(new CreateInvoiceRequest(null)))
                .anySatisfy(v -> assertThat(v.getPropertyPath()).hasToString("paymentId"));
    }
}