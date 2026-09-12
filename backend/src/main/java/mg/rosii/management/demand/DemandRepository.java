package mg.rosii.management.demand;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * All queries exclude soft-deleted demands explicitly (no global Hibernate
 * filter, per docs/database-conventions.md). Newest first ordering.
 */
public interface DemandRepository extends JpaRepository<Demand, UUID> {

    Optional<Demand> findByIdAndDeletedAtIsNull(UUID id);

    /**
     * Listing with optional combined filters; null parameters mean "no filter".
     * Search covers the client's name and phones, the demand location and
     * notes, and the event type when present. The caller provides a
     * lower-cased, LIKE-escaped {@code %pattern%}.
     */
    @Query("""
            select d from Demand d
            join d.client c
            left join d.eventDetails e
            where d.deletedAt is null
              and (:clientId is null or c.id = :clientId)
              and (:type is null or d.type = :type)
              and (:status is null or d.status = :status)
              and (:pattern is null
                   or lower(c.name) like :pattern escape '\\'
                   or c.phone1 like :pattern escape '\\'
                   or lower(coalesce(c.phone2, '')) like :pattern escape '\\'
                   or lower(coalesce(d.location, '')) like :pattern escape '\\'
                   or lower(coalesce(d.notes, '')) like :pattern escape '\\'
                   or lower(coalesce(e.eventType, '')) like :pattern escape '\\')
            order by d.createdAt desc
            """)
    List<Demand> findMatching(@Param("pattern") String pattern,
            @Param("clientId") UUID clientId,
            @Param("type") DemandType type,
            @Param("status") DemandStatus status);
}
