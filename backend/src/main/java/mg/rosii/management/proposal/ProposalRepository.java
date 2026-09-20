package mg.rosii.management.proposal;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * All queries exclude soft-deleted proposals explicitly (no global Hibernate
 * filter, per docs/database-conventions.md). Newest first ordering.
 */
public interface ProposalRepository extends JpaRepository<Proposal, UUID> {

    Optional<Proposal> findByIdAndDeletedAtIsNull(UUID id);

    /** All proposal numbers starting with the given PROP-YYYY- prefix (numbering). */
    @Query("select p.number from Proposal p where p.number like concat(:prefix, '%')")
    List<String> findNumbersByPrefix(@Param("prefix") String prefix);

    /**
     * Listing with optional combined filters; null parameters mean "no filter".
     * Search covers the proposal number/title/notes and the client name. The
     * caller provides a lower-cased, LIKE-escaped {@code %pattern%}. Lines are
     * fetched eagerly here to avoid N+1.
     *
     * <p>A {@code status=SENT} filter additionally excludes proposals whose
     * {@code validUntil} is already past ({@code sentStatus}/{@code today}):
     * those are lazily treated as EXPIRED, so they must not be reported as SENT.
     */
    @EntityGraph(attributePaths = "lines")
    @Query("""
            select p from Proposal p
            join p.client c
            where p.deletedAt is null
              and (:clientId is null or c.id = :clientId)
              and (:demandId is null or p.demand.id = :demandId)
              and (:status is null or p.status = :status)
              and (:status is null
                   or :status <> :sentStatus
                   or p.validUntil is null
                   or p.validUntil >= :today)
              and (:pattern is null
                   or lower(p.number) like :pattern escape '\\'
                   or lower(coalesce(p.title, '')) like :pattern escape '\\'
                   or lower(coalesce(p.notes, '')) like :pattern escape '\\'
                   or lower(c.name) like :pattern escape '\\')
            order by p.createdAt desc
            """)
    List<Proposal> findMatching(@Param("pattern") String pattern,
            @Param("clientId") UUID clientId,
            @Param("demandId") UUID demandId,
            @Param("status") ProposalStatus status,
            @Param("sentStatus") ProposalStatus sentStatus,
            @Param("today") LocalDate today);
}
