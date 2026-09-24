package mg.rosii.management.execution;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

import jakarta.validation.Validation;
import jakarta.validation.Validator;

import mg.rosii.management.execution.dto.CreateExecutionRequest;
import mg.rosii.management.execution.dto.UpdateExecutionRequest;
import mg.rosii.management.execution.dto.UpdateExecutionStatusRequest;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pure Bean-Validation unit tests for the execution request contract (no
 * Spring context, no database). Workflow gates (ACCEPTED proposal, deposit
 * reached, 1:1 preparation), the state machine, the time-range check (400) and
 * status-dependent editability are service-level and covered by the integration
 * tests.
 */
class ExecutionRequestValidationTest {

    private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void validCreateRequestHasNoViolations() {
        assertThat(VALIDATOR.validate(new CreateExecutionRequest(UUID.randomUUID()))).isEmpty();
    }

    @Test
    void missingPreparationIsRejected() {
        assertThat(VALIDATOR.validate(new CreateExecutionRequest(null)))
                .anySatisfy(v -> assertThat(v.getPropertyPath()).hasToString("preparationId"));
    }

    @Test
    void validUpdateRequestHasNoViolations() {
        assertThat(VALIDATOR.validate(new UpdateExecutionRequest(
                0L, LocalDate.of(2999, 12, 20), LocalTime.of(8, 0), LocalTime.of(17, 0),
                "Salle des fêtes", "Montage le matin"))).isEmpty();
    }

    /** scheduledDate is mandatory for a valid Execution — never invented server-side. */
    @Test
    void missingScheduledDateIsRejected() {
        assertThat(VALIDATOR.validate(new UpdateExecutionRequest(0L, null, null, null, null, null)))
                .anySatisfy(v -> assertThat(v.getPropertyPath()).hasToString("scheduledDate"));
    }

    /** version is mandatory for optimistic locking (409 on stale). */
    @Test
    void missingVersionIsRejected() {
        assertThat(VALIDATOR.validate(new UpdateExecutionRequest(
                null, LocalDate.of(2999, 12, 20), null, null, null, null)))
                .anySatisfy(v -> assertThat(v.getPropertyPath()).hasToString("version"));
    }

    @Test
    void validStatusRequestHasNoViolations() {
        assertThat(VALIDATOR.validate(new UpdateExecutionStatusRequest(ExecutionStatus.IN_PROGRESS))).isEmpty();
    }

    @Test
    void missingStatusIsRejected() {
        assertThat(VALIDATOR.validate(new UpdateExecutionStatusRequest(null)))
                .anySatisfy(v -> assertThat(v.getPropertyPath()).hasToString("status"));
    }
}