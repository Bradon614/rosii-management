package mg.rosii.management.client;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * All queries exclude soft-deleted clients explicitly (no global Hibernate
 * filter, per docs/database-conventions.md).
 */
public interface ClientRepository extends JpaRepository<Client, UUID> {

    Optional<Client> findByIdAndDeletedAtIsNull(UUID id);

    @Query("select c from Client c where c.deletedAt is null order by lower(c.name)")
    List<Client> findAllActive();

    /**
     * Case-insensitive substring search across name, both phones and email.
     * The caller provides a lower-cased, LIKE-escaped {@code %pattern%}.
     */
    @Query("""
            select c from Client c
            where c.deletedAt is null
              and (lower(c.name) like :pattern escape '\\'
                   or c.phone1 like :pattern escape '\\'
                   or coalesce(c.phone2, '') like :pattern escape '\\'
                   or coalesce(c.email, '') like :pattern escape '\\')
            order by lower(c.name)
            """)
    List<Client> searchActive(@Param("pattern") String pattern);
}
