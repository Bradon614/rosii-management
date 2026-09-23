package mg.rosii.management.preparation;

import java.util.UUID;

import jakarta.validation.Validation;
import jakarta.validation.Validator;

import mg.rosii.management.preparation.dto.CreatePreparationRequest;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pure Bean-Validation unit tests for the preparation request contract (no
 * Spring context, no database). Proposal existence/status/deposit rules are
 * service-level and covered by the integration tests.
 */
class PreparationRequestValidationTest {

    private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void validCreateRequestHasNoViolations() {
        assertThat(VALIDATOR.validate(new CreatePreparationRequest(UUID.randomUUID()))).isEmpty();
    }

    @Test
    void missingProposalIsRejected() {
        assertThat(VALIDATOR.validate(new CreatePreparationRequest(null)))
                .anySatisfy(v -> assertThat(v.getPropertyPath()).hasToString("proposalId"));
    }
}
