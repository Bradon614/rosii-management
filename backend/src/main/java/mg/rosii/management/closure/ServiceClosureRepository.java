package mg.rosii.management.closure;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * All queries exclude soft-deleted closures explicitly (no global Hibernate
 * filter, per docs/database-conventions.md). Listing is chronological
 * (closedAt ascending).
 */
public interface ServiceClosureRepository extends JpaRepository<ServiceClosure, UUID> {

    /**
     * Single closure read. Feature 34: the preparation and its proposal are
     * fetched with the row (two {@code @ManyToOne} hops) so the response can
     * expose the proposal without extra statements.
     */
    @EntityGraph(attributePaths = { "preparation", "preparation.proposal" })
    Optional<ServiceClosure> findByIdAndDeletedAtIsNull(UUID id);

    /** One active closure per preparation (the 1:1 workflow rule). */
    boolean existsByPreparationIdAndDeletedAtIsNull(UUID preparationId);

    /** The active closure of a preparation (Feature 17 dossier). */
    Optional<ServiceClosure> findByPreparationIdAndDeletedAtIsNull(UUID preparationId);

    /**
     * Listing with optional combined filters; null parameters mean "no filter"
     * (same repository-wide pattern as the other list endpoints — both parameter
     * types, UUID and enum, are supported by the null-tested form).
     *
     * <p>Feature 34 — the list response exposes the proposal of each closure
     * (number and id, so the UI no longer reads one preparation per row). Both
     * hops are {@code @ManyToOne}, so the joined fetches keep the query at ONE
     * SQL statement and cannot duplicate rows (no collection is joined).
     */
    @Query("""
            select c from ServiceClosure c
            join fetch c.preparation p
            join fetch p.proposal
            where c.deletedAt is null
              and (:preparationId is null or p.id = :preparationId)
              and (:status is null or c.status = :status)
            order by c.closedAt asc, c.createdAt asc
            """)
    List<ServiceClosure> findMatching(@Param("preparationId") UUID preparationId,
            @Param("status") ClosureStatus status);
}