package mg.rosii.management.service;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * All queries exclude soft-deleted services explicitly (no global Hibernate
 * filter, per docs/database-conventions.md).
 */
public interface ServiceRepository extends JpaRepository<Service, UUID> {

    Optional<Service> findByIdAndDeletedAtIsNull(UUID id);

    /**
     * Catalogue listing with optional combined filters; null parameters mean
     * "no filter". The caller provides a lower-cased, LIKE-escaped
     * {@code %pattern%} for search (name and description).
     */
    @Query("""
            select s from Service s
            where s.deletedAt is null
              and (:pattern is null
                   or lower(s.name) like :pattern escape '\\'
                   or lower(coalesce(s.description, '')) like :pattern escape '\\')
              and (:category is null or s.category = :category)
              and (:active is null or s.active = :active)
            order by lower(s.name)
            """)
    List<Service> findMatching(@Param("pattern") String pattern,
            @Param("category") ServiceCategory category,
            @Param("active") Boolean active);
}
