package mg.rosii.management.closure;

import java.util.UUID;

import jakarta.validation.Validation;
import jakarta.validation.Validator;

import mg.rosii.management.closure.dto.CreateClosureRequest;
import mg.rosii.management.closure.dto.UpdateClosureRequest;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pure Bean-Validation unit tests for the closure request contract (no Spring
 * context, no database). Workflow gates (existing preparation, ACCEPTED
 * proposal, reached deposit, COMPLETED execution, one active closure), the
 * definitive-closure rule (409) and soft delete are service-level and covered
 * by the integration tests.
 */
class ClosureRequestValidationTest {

    private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void validCreateRequestHasNoViolations() {
        assertThat(VALIDATOR.validate(new CreateClosureRequest(
                UUID.randomUUID(), ClosureStatus.WITH_ISSUE, "Prestation terminée avec un incident mineur.")))
                .isEmpty();
    }

    /** status may be omitted: the service defaults it to COMPLETED. */
    @Test
    void createRequestWithoutStatusIsValid() {
        assertThat(VALIDATOR.validate(new CreateClosureRequest(UUID.randomUUID(), null, null))).isEmpty();
    }

    /** finalNotes is optional: null passes. */
    @Test
    void createRequestWithoutFinalNotesIsValid() {
        assertThat(VALIDATOR.validate(new CreateClosureRequest(
                UUID.randomUUID(), ClosureStatus.COMPLETED, null))).isEmpty();
    }

    @Test
    void missingPreparationIdIsRejected() {
        assertThat(VALIDATOR.validate(new CreateClosureRequest(null, null, null)))
                .anySatisfy(v -> assertThat(v.getPropertyPath()).hasToString("preparationId"));
    }

    /** Boundary: exactly 2000 characters is still valid. */
    @Test
    void finalNotesAtTheLimitIsValid() {
        assertThat(VALIDATOR.validate(new CreateClosureRequest(
                UUID.randomUUID(), null, "x".repeat(2000)))).isEmpty();
    }

    @Test
    void finalNotesOverTheLimitIsRejected() {
        assertThat(VALIDATOR.validate(new CreateClosureRequest(
                UUID.randomUUID(), null, "x".repeat(2001))))
                .anySatisfy(v -> assertThat(v.getPropertyPath()).hasToString("finalNotes"));
    }

    @Test
    void validUpdateRequestHasNoViolations() {
        assertThat(VALIDATOR.validate(new UpdateClosureRequest(0L, "Remarque client."))).isEmpty();
    }

    /** version is mandatory for optimistic locking (409 on stale). */
    @Test
    void missingVersionIsRejected() {
        assertThat(VALIDATOR.validate(new UpdateClosureRequest(null, null)))
                .anySatisfy(v -> assertThat(v.getPropertyPath()).hasToString("version"));
    }

    @Test
    void updateFinalNotesOverTheLimitIsRejected() {
        assertThat(VALIDATOR.validate(new UpdateClosureRequest(0L, "x".repeat(2001))))
                .anySatisfy(v -> assertThat(v.getPropertyPath()).hasToString("finalNotes"));
    }
}