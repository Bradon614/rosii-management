package mg.rosii.management.execution;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Optional;
import java.util.UUID;

import mg.rosii.management.closure.ServiceClosureRepository;
import mg.rosii.management.execution.dto.ExecutionResponse;
import mg.rosii.management.execution.dto.UpdateExecutionRequest;
import mg.rosii.management.payment.PaymentRepository;
import mg.rosii.management.preparation.Preparation;
import mg.rosii.management.preparation.PreparationRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit-level guard of the Feature 32 update contract (no Spring context, no
 * database): while PLANNED the scheduled date stays mandatory (400), while
 * IN_PROGRESS the payload schedule fields are optional and an omitted value
 * keeps the stored one (including a stored null date), a provided value that
 * differs is still 409, and COMPLETED/CANCELLED plus stale versions are
 * unchanged. The real HTTP/PostgreSQL behavior is covered by
 * {@link ExecutionInProgressUpdateIntegrationTest}.
 */
class ExecutionServiceInProgressUpdateTest {

    private static final LocalDate STORED_DATE = LocalDate.of(2999, 12, 20);
    private static final LocalTime STORED_START = LocalTime.of(8, 0);
    private static final LocalTime STORED_END = LocalTime.of(17, 0);

    private final UUID executionId = UUID.randomUUID();

    private ExecutionRepository executions;
    private ExecutionService service;
    private Execution execution;

    @BeforeEach
    void setUp() {
        executions = mock(ExecutionRepository.class);
        service = new ExecutionService(executions, mock(PreparationRepository.class),
                mock(PaymentRepository.class), mock(ServiceClosureRepository.class));

        Preparation preparation = mock(Preparation.class);
        when(preparation.getId()).thenReturn(UUID.randomUUID());
        execution = new Execution();
        execution.setPreparation(preparation);
        when(executions.findByIdAndDeletedAtIsNull(executionId)).thenReturn(Optional.of(execution));
        when(executions.saveAndFlush(any(Execution.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
    }

    private UpdateExecutionRequest request(LocalDate scheduledDate, LocalTime startTime, LocalTime endTime,
            String location, String notes) {
        return new UpdateExecutionRequest(0L, scheduledDate, startTime, endTime, location, notes);
    }

    private UpdateExecutionRequest request(Long version) {
        return new UpdateExecutionRequest(version, null, null, null, "Salle B", "Retard sonorisation");
    }

    /** Stores an IN_PROGRESS execution with the given schedule. */
    private void inProgressWith(LocalDate scheduledDate, LocalTime startTime, LocalTime endTime) {
        execution.setStatus(ExecutionStatus.IN_PROGRESS);
        execution.setScheduledDate(scheduledDate);
        execution.setStartTime(startTime);
        execution.setEndTime(endTime);
    }

    @Test
    void refusesPlannedUpdateWithoutScheduledDate() {
        execution.setStatus(ExecutionStatus.PLANNED);

        assertThatThrownBy(() -> service.update(executionId, request(null, null, null, "Salle B", null)))
                .isInstanceOfSatisfying(ResponseStatusException.class, exception ->
                        assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));

        // Nothing is written and no date is invented.
        assertThat(execution.getScheduledDate()).isNull();
        assertThat(execution.getLocation()).isNull();
        verify(executions, never()).saveAndFlush(any(Execution.class));
    }

    @Test
    void updatesPlannedExecutionWithScheduledDate() {
        execution.setStatus(ExecutionStatus.PLANNED);

        ExecutionResponse response = service.update(executionId,
                request(STORED_DATE, STORED_START, STORED_END, "Salle A", "Montage"));

        assertThat(response.scheduledDate()).isEqualTo(STORED_DATE);
        assertThat(execution.getScheduledDate()).isEqualTo(STORED_DATE);
        assertThat(execution.getStartTime()).isEqualTo(STORED_START);
        assertThat(execution.getEndTime()).isEqualTo(STORED_END);
        assertThat(execution.getLocation()).isEqualTo("Salle A");
        assertThat(execution.getNotes()).isEqualTo("Montage");
    }

    /** Feature 32: an omitted schedule keeps the stored date and times. */
    @Test
    void correctsLocationAndNotesInProgressWithoutResendingTheSchedule() {
        inProgressWith(STORED_DATE, STORED_START, STORED_END);

        ExecutionResponse response = service.update(executionId, request(null, null, null, "Salle B", "Retard"));

        assertThat(response.location()).isEqualTo("Salle B");
        assertThat(response.notes()).isEqualTo("Retard");
        // The stored schedule is untouched, not cleared and not re-created.
        assertThat(execution.getScheduledDate()).isEqualTo(STORED_DATE);
        assertThat(execution.getStartTime()).isEqualTo(STORED_START);
        assertThat(execution.getEndTime()).isEqualTo(STORED_END);
        assertThat(response.scheduledDate()).isEqualTo(STORED_DATE);
        assertThat(response.startTime()).isEqualTo(STORED_START);
        assertThat(response.endTime()).isEqualTo(STORED_END);
    }

    /** Feature 32: an execution created without a date can still be corrected. */
    @Test
    void correctsInProgressExecutionThatHasNoStoredDateAndInventsNone() {
        inProgressWith(null, null, null);

        ExecutionResponse response = service.update(executionId, request(null, null, null, "Salle A", null));

        assertThat(response.location()).isEqualTo("Salle A");
        assertThat(response.scheduledDate()).isNull();
        assertThat(execution.getScheduledDate()).isNull();
        assertThat(execution.getStartTime()).isNull();
        assertThat(execution.getEndTime()).isNull();
    }

    @Test
    void acceptsInProgressUpdateWhenTheProvidedScheduleMatchesTheStoredOne() {
        inProgressWith(STORED_DATE, STORED_START, STORED_END);

        service.update(executionId, request(STORED_DATE, STORED_START, STORED_END, "Salle B", null));

        assertThat(execution.getLocation()).isEqualTo("Salle B");
        assertThat(execution.getScheduledDate()).isEqualTo(STORED_DATE);
    }

    @Test
    void refusesInProgressRescheduleAttemptWithAProvidedDifferentDate() {
        inProgressWith(STORED_DATE, STORED_START, STORED_END);

        assertThatThrownBy(() -> service.update(executionId,
                request(STORED_DATE.plusDays(1), null, null, "Salle B", null)))
                .isInstanceOfSatisfying(ResponseStatusException.class, exception -> {
                    assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(exception.getReason()).contains("rescheduled");
                });

        assertThat(execution.getScheduledDate()).isEqualTo(STORED_DATE);
        assertThat(execution.getLocation()).isNull();
        verify(executions, never()).saveAndFlush(any(Execution.class));
    }

    @Test
    void refusesInProgressRescheduleAttemptWithAProvidedDifferentTime() {
        inProgressWith(STORED_DATE, STORED_START, STORED_END);

        assertThatThrownBy(() -> service.update(executionId,
                request(STORED_DATE, STORED_START.plusHours(1), STORED_END, "Salle B", null)))
                .isInstanceOfSatisfying(ResponseStatusException.class, exception ->
                        assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));

        assertThat(execution.getStartTime()).isEqualTo(STORED_START);
        assertThat(execution.getLocation()).isNull();
    }

    @Test
    void refusesUpdateOnceCompletedOrCancelled() {
        for (ExecutionStatus terminal : new ExecutionStatus[] {
                ExecutionStatus.COMPLETED, ExecutionStatus.CANCELLED }) {
            execution.setStatus(terminal);

            assertThatThrownBy(() -> service.update(executionId, request(null, null, null, "Salle B", null)))
                    .isInstanceOfSatisfying(ResponseStatusException.class, exception -> {
                        assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
                        assertThat(exception.getReason()).contains(terminal.name());
                    });

            assertThat(execution.getLocation()).isNull();
        }
        // The status rule wins over the PLANNED mandatory-date rule.
        verify(executions, never()).saveAndFlush(any(Execution.class));
    }

    @Test
    void refusesStaleVersionOnInProgressUpdate() {
        inProgressWith(null, null, null);

        assertThatThrownBy(() -> service.update(executionId, request(7L)))
                .isInstanceOfSatisfying(ResponseStatusException.class, exception -> {
                    assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(exception.getReason()).contains("concurrently");
                });

        assertThat(execution.getLocation()).isNull();
        verify(executions, never()).saveAndFlush(any(Execution.class));
    }
}
