package mg.rosii.management.payment;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

import jakarta.validation.Validation;
import jakarta.validation.Validator;

import mg.rosii.management.payment.dto.CreatePaymentRequest;
import mg.rosii.management.payment.dto.UpdatePaymentRequest;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pure Bean-Validation unit tests for the payment request contracts (no Spring
 * context, no database). Proposal existence/status and the "not above the
 * proposal total" rule are service-level and covered by the integration tests.
 */
class PaymentRequestValidationTest {

    private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();

    private static CreatePaymentRequest validCreate() {
        return new CreatePaymentRequest(UUID.randomUUID(), new BigDecimal("500000"),
                PaymentMethod.CASH, LocalDate.now(), "REC-1", "Acompte");
    }

    @Test
    void validCreateRequestHasNoViolations() {
        assertThat(VALIDATOR.validate(validCreate())).isEmpty();
    }

    @Test
    void missingProposalIsRejected() {
        var request = new CreatePaymentRequest(null, new BigDecimal("1000"), PaymentMethod.CASH,
                LocalDate.now(), null, null);
        assertThat(VALIDATOR.validate(request))
                .anySatisfy(v -> assertThat(v.getPropertyPath()).hasToString("proposalId"));
    }

    @Test
    void missingAmountMethodAndDateAreRejected() {
        var request = new CreatePaymentRequest(UUID.randomUUID(), null, null, null, null, null);
        assertThat(VALIDATOR.validate(request))
                .extracting(v -> v.getPropertyPath().toString())
                .contains("amount", "method", "paymentDate");
    }

    @Test
    void zeroOrNegativeAmountIsRejected() {
        for (String amount : new String[] {"0", "-1", "-0.01"}) {
            var request = new CreatePaymentRequest(UUID.randomUUID(), new BigDecimal(amount),
                    PaymentMethod.MOBILE_MONEY, LocalDate.now(), null, null);
            assertThat(VALIDATOR.validate(request))
                    .anySatisfy(v -> assertThat(v.getPropertyPath()).hasToString("amount"));
        }
    }

    @Test
    void oversizedReferenceAndNotesAreRejected() {
        var request = new CreatePaymentRequest(UUID.randomUUID(), new BigDecimal("1000"),
                PaymentMethod.BANK_TRANSFER, LocalDate.now(), "r".repeat(101), "n".repeat(2001));
        assertThat(VALIDATOR.validate(request))
                .extracting(v -> v.getPropertyPath().toString())
                .contains("reference", "notes");
    }

    @Test
    void updateRequestRequiresVersion() {
        var request = new UpdatePaymentRequest(null, new BigDecimal("1000"), PaymentMethod.CASH,
                LocalDate.now(), null, null);
        assertThat(VALIDATOR.validate(request))
                .anySatisfy(v -> assertThat(v.getPropertyPath()).hasToString("version"));
    }
}
