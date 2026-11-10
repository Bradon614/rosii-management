package mg.rosii.management.execution;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * All queries exclude soft-deleted executions explicitly (no global Hibernate
 * filter, per docs/database-conventions.md). Listing is chronological
 * (scheduledDate ascending, undated last).
 */
public interface ExecutionRepository extends JpaRepository<Execution, UUID> {

    /**
     * Single execution read. Feature 34: the preparation and its proposal are
     * fetched with the row (two {@code @ManyToOne} hops) so the response can
     * expose the proposal number without extra statements — a single-row
     * endpoint stays at ONE query instead of one per lazy proxy.
     */
    @EntityGraph(attributePaths = { "preparation", "preparation.proposal" })
    Optional<Execution> findByIdAndDeletedAtIsNull(UUID id);

    /** One active execution per preparation (the 1:1 workflow rule). */
    boolean existsByPreparationIdAndDeletedAtIsNull(UUID preparationId);

    /**
     * The active execution of a preparation (Feature 17 dossier). Feature 34
     * fetches the preparation and its proposal with the row so the response can
     * expose the proposal number without extra statements.
     */
    @EntityGraph(attributePaths = { "preparation", "preparation.proposal" })
    Optional<Execution> findByPreparationIdAndDeletedAtIsNull(UUID preparationId);

    /**
     * Listing with optional combined filters; null parameters mean "no filter".
     *
     * <p>PostgreSQL cannot type a null-tested {@code LocalDate} parameter
     * ("could not determine data type of parameter"; Hibernate 6 declares
     * {@code (:x is null ...)} unsupported), so {@code scheduledDate} uses the
     * boolean-flag form recommended by Hibernate instead of an IS NULL
     * predicate. preparationId/status keep the repository-wide pattern used by
     * every other list endpoint (validated by the integration tests).
     *
     * <p>Feature 34 — the list response exposes the proposal of each execution
     * (number and id, so the UI no longer reads one preparation per row). Both
     * hops are {@code @ManyToOne}, so the two joined fetches keep the query at
     * ONE SQL statement and cannot duplicate rows (no collection is joined).
     */
    @Query("""
            select e from Execution e
            join fetch e.preparation p
            join fetch p.proposal
            where e.deletedAt is null
              and (:preparationId is null or p.id = :preparationId)
              and (:status is null or e.status = :status)
              and (:dateFiltered = false or e.scheduledDate = :scheduledDate)
            order by e.scheduledDate asc, e.createdAt asc
            """)
    List<Execution> findMatching(@Param("preparationId") UUID preparationId,
            @Param("status") ExecutionStatus status,
            @Param("scheduledDate") LocalDate scheduledDate,
            @Param("dateFiltered") boolean dateFiltered);

    /**
     * Feature 34 — active executions of several preparations in one statement,
     * used by the closure list to resolve its execution context without one
     * read per row ({@code in :ids}, soft-deleted rows excluded).
     */
    List<Execution> findByPreparationIdInAndDeletedAtIsNull(Collection<UUID> preparationIds);

    /**
     * Feature 16 — service availability: the executions that occupy a given
     * service date. Only active executions count (soft-deleted ones are always
     * excluded) and only the date-occupying statuses given by the caller
     * (PLANNED and IN_PROGRESS — COMPLETED keeps the history but frees the
     * date, CANCELLED never blocks). {@code excludedId} optionally ignores one
     * execution so an existing service never conflicts with itself when it is
     * being moved; everything is filtered in the query, nothing is loaded in
     * memory to be discarded afterwards. The {@code :excludedId is null}
     * boolean-guard form follows the repository-wide convention above (UUID
     * parameters, unlike LocalDate, are accepted by PostgreSQL there).
     */
    @Query("""
            select e from Execution e
            where e.deletedAt is null
              and e.status in :statuses
              and e.scheduledDate = :scheduledDate
              and (:excludedId is null or e.id <> :excludedId)
            """)
    List<Execution> findActiveByScheduledDate(@Param("scheduledDate") LocalDate scheduledDate,
            @Param("statuses") Collection<ExecutionStatus> statuses,
            @Param("excludedId") UUID excludedId);
}