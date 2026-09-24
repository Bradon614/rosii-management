package mg.rosii.management.execution;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * All queries exclude soft-deleted executions explicitly (no global Hibernate
 * filter, per docs/database-conventions.md). Listing is chronological
 * (scheduledDate ascending, undated last).
 */
public interface ExecutionRepository extends JpaRepository<Execution, UUID> {

    Optional<Execution> findByIdAndDeletedAtIsNull(UUID id);

    /** One active execution per preparation (the 1:1 workflow rule). */
    boolean existsByPreparationIdAndDeletedAtIsNull(UUID preparationId);

    /**
     * Listing with optional combined filters; null parameters mean "no filter".
     *
     * <p>PostgreSQL cannot type a null-tested {@code LocalDate} parameter
     * ("could not determine data type of parameter"; Hibernate 6 declares
     * {@code (:x is null ...)} unsupported), so {@code scheduledDate} uses the
     * boolean-flag form recommended by Hibernate instead of an IS NULL
     * predicate. preparationId/status keep the repository-wide pattern used by
     * every other list endpoint (validated by the integration tests).
     */
    @Query("""
            select e from Execution e
            where e.deletedAt is null
              and (:preparationId is null or e.preparation.id = :preparationId)
              and (:status is null or e.status = :status)
              and (:dateFiltered = false or e.scheduledDate = :scheduledDate)
            order by e.scheduledDate asc, e.createdAt asc
            """)
    List<Execution> findMatching(@Param("preparationId") UUID preparationId,
            @Param("status") ExecutionStatus status,
            @Param("scheduledDate") LocalDate scheduledDate,
            @Param("dateFiltered") boolean dateFiltered);
}