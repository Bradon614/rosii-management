package mg.rosii.management.execution;

import java.util.Optional;
import java.util.UUID;

import mg.rosii.management.closure.ServiceClosureRepository;
import mg.rosii.management.payment.PaymentRepository;
import mg.rosii.management.preparation.Preparation;
import mg.rosii.management.preparation.PreparationRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Unit-level guard of the Feature 31 deletion integrity rule (no Spring context,
 * no database): an active closure refuses the soft delete of its execution with
 * 409, while a closure excluded by the repository query (soft-deleted row) does
 * not block it. A closure is linked to the preparation (Feature 11), so the
 * check resolves the dependency through the execution's preparation. The real
 * HTTP/PostgreSQL behavior is covered by
 * {@link ExecutionDeletionIntegrityIntegrationTest}.
 */
class ExecutionServiceDeletionIntegrityTest {

    private final UUID executionId = UUID.randomUUID();
    private final UUID preparationId = UUID.randomUUID();

    private ExecutionRepository executions;
    private ServiceClosureRepository closures;
    private ExecutionService service;
    private Execution execution;

    @BeforeEach
    void setUp() {
        executions = mock(ExecutionRepository.class);
        closures = mock(ServiceClosureRepository.class);
        service = new ExecutionService(executions, mock(PreparationRepository.class),
                mock(PaymentRepository.class), closures);

        Preparation preparation = mock(Preparation.class);
        when(preparation.getId()).thenReturn(preparationId);
        execution = new Execution();
        execution.setPreparation(preparation);
        when(executions.findByIdAndDeletedAtIsNull(executionId)).thenReturn(Optional.of(execution));
    }

    @Test
    void softDeletesWhenNoActiveClosureDependsOnTheExecution() {
        when(closures.existsByPreparationIdAndDeletedAtIsNull(preparationId)).thenReturn(false);

        service.delete(executionId);

        assertThat(execution.getDeletedAt()).isNotNull();
        verify(executions).findByIdAndDeletedAtIsNull(executionId);
        // The closure is resolved through the execution's preparation.
        verify(closures).existsByPreparationIdAndDeletedAtIsNull(preparationId);
    }

    @Test
    void refusesWhenAnActiveClosureDependsOnTheExecution() {
        when(closures.existsByPreparationIdAndDeletedAtIsNull(preparationId)).thenReturn(true);

        assertThatThrownBy(() -> service.delete(executionId))
                .isInstanceOfSatisfying(ResponseStatusException.class, exception -> {
                    assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(exception.getReason()).contains("closure");
                });

        // A refused deletion writes nothing: the row stays active.
        assertThat(execution.getDeletedAt()).isNull();
    }

    @Test
    void allowsDeletionWhenTheOnlyClosureIsSoftDeleted() {
        // The existence query filters deletedAt is null, so a soft-deleted
        // closure answers false here and never blocks the deletion.
        when(closures.existsByPreparationIdAndDeletedAtIsNull(preparationId)).thenReturn(false);

        service.delete(executionId);

        assertThat(execution.getDeletedAt()).isNotNull();
    }

    @Test
    void unknownOrSoftDeletedExecutionStillAnswers404WithoutClosureQuery() {
        when(executions.findByIdAndDeletedAtIsNull(executionId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.delete(executionId))
                .isInstanceOfSatisfying(ResponseStatusException.class, exception ->
                        assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND));

        // The 404 short-circuits: no useless closure query.
        verifyNoInteractions(closures);
    }
}
