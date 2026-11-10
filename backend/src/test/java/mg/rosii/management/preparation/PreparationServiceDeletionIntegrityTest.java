package mg.rosii.management.preparation;

import java.util.Optional;
import java.util.UUID;

import mg.rosii.management.closure.ServiceClosureRepository;
import mg.rosii.management.execution.ExecutionRepository;
import mg.rosii.management.payment.PaymentRepository;
import mg.rosii.management.proposal.ProposalRepository;

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
 * Unit-level guard of the Feature 30 deletion integrity rule (no Spring context,
 * no database): an active execution or closure refuses the soft delete with 409,
 * while dependencies excluded by the repository queries (soft-deleted rows) do
 * not block it. The real HTTP/PostgreSQL behavior is covered by
 * {@link PreparationDeletionIntegrityIntegrationTest}.
 */
class PreparationServiceDeletionIntegrityTest {

    private final UUID preparationId = UUID.randomUUID();

    private PreparationRepository preparations;
    private ExecutionRepository executions;
    private ServiceClosureRepository closures;
    private PreparationService service;
    private Preparation preparation;

    @BeforeEach
    void setUp() {
        preparations = mock(PreparationRepository.class);
        executions = mock(ExecutionRepository.class);
        closures = mock(ServiceClosureRepository.class);
        service = new PreparationService(preparations, mock(ProposalRepository.class),
                mock(PaymentRepository.class), executions, closures);

        preparation = new Preparation();
        when(preparations.findByIdAndDeletedAtIsNull(preparationId))
                .thenReturn(Optional.of(preparation));
    }

    @Test
    void softDeletesWhenNoActiveDependencyExists() {
        when(executions.existsByPreparationIdAndDeletedAtIsNull(preparationId)).thenReturn(false);
        when(closures.existsByPreparationIdAndDeletedAtIsNull(preparationId)).thenReturn(false);

        service.delete(preparationId);

        assertThat(preparation.getDeletedAt()).isNotNull();
        verify(preparations).findByIdAndDeletedAtIsNull(preparationId);
        verify(executions).existsByPreparationIdAndDeletedAtIsNull(preparationId);
        verify(closures).existsByPreparationIdAndDeletedAtIsNull(preparationId);
    }

    @Test
    void refusesWhenAnActiveExecutionExistsWithoutLookingAtClosures() {
        when(executions.existsByPreparationIdAndDeletedAtIsNull(preparationId)).thenReturn(true);

        assertThatThrownBy(() -> service.delete(preparationId))
                .isInstanceOfSatisfying(ResponseStatusException.class, exception -> {
                    assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(exception.getReason()).contains("execution");
                });

        assertThat(preparation.getDeletedAt()).isNull();
        // The first refusal short-circuits: no useless closure query.
        verifyNoInteractions(closures);
    }

    @Test
    void refusesWhenAnActiveClosureExists() {
        when(executions.existsByPreparationIdAndDeletedAtIsNull(preparationId)).thenReturn(false);
        when(closures.existsByPreparationIdAndDeletedAtIsNull(preparationId)).thenReturn(true);

        assertThatThrownBy(() -> service.delete(preparationId))
                .isInstanceOfSatisfying(ResponseStatusException.class, exception -> {
                    assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(exception.getReason()).contains("closure");
                });

        assertThat(preparation.getDeletedAt()).isNull();
    }

    @Test
    void allowsDeletionWhenDependenciesAreOnlySoftDeleted() {
        // The repository existence queries filter deletedAt is null, so a
        // soft-deleted execution/closure answers false here.
        when(executions.existsByPreparationIdAndDeletedAtIsNull(preparationId)).thenReturn(false);
        when(closures.existsByPreparationIdAndDeletedAtIsNull(preparationId)).thenReturn(false);

        service.delete(preparationId);

        assertThat(preparation.getDeletedAt()).isNotNull();
    }

    @Test
    void unknownOrSoftDeletedPreparationStillAnswers404WithoutDependencyQueries() {
        when(preparations.findByIdAndDeletedAtIsNull(preparationId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.delete(preparationId))
                .isInstanceOfSatisfying(ResponseStatusException.class, exception ->
                        assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND));

        verifyNoInteractions(executions, closures);
    }
}