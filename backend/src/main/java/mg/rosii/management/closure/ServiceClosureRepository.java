package mg.rosii.management.closure;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * All queries exclude soft-deleted closures explicitly (no global Hibernate
 * filter, per docs/database-conventions.md). Listing is chronological
 * (closedAt ascending).
 */
public interface ServiceClosureRepository extends JpaRepository<ServiceClosure, UUID> {

    Optional<ServiceClosure> findByIdAndDeletedAtIsNull(UUID id);

    /** One active closure per preparation (the 1:1 workflow rule). */
    boolean existsByPreparationIdAndDeletedAtIsNull(UUID preparationId);

    /**
     * Listing with optional combined filters; null parameters mean "no filter"
     * (same repository-wide pattern as the other list endpoints — both parameter
     * types, UUID and enum, are supported by the null-tested form).
     */
    @Query("""
            select c from ServiceClosure c
            where c.deletedAt is null
              and (:preparationId is null or c.preparation.id = :preparationId)
              and (:status is null or c.status = :status)
            order by c.closedAt asc, c.createdAt asc
            """)
    List<ServiceClosure> findMatching(@Param("preparationId") UUID preparationId,
            @Param("status") ClosureStatus status);
}