package mg.rosii.management.payment;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * All queries exclude soft-deleted payments explicitly (no global Hibernate
 * filter, per docs/database-conventions.md). Newest payment date first.
 */
public interface PaymentRepository extends JpaRepository<Payment, UUID> {

    Optional<Payment> findByIdAndDeletedAtIsNull(UUID id);

    /**
     * Listing with optional combined filters; null parameters mean "no filter".
     *
     * <p>PostgreSQL cannot type a null-tested {@code LocalDate} parameter: with
     * {@code (:paymentDate is null or p.paymentDate = :paymentDate)} the generated
     * SQL is {@code (? is null or payment_date = ?)} and the server answers
     * {@code could not determine data type of parameter $5} (HTTP 500). The
     * boolean guard below is the same form already used by
     * {@code ExecutionRepository}: it keeps the filter meaning "exactly this
     * local date" and never turns it into a period.
     */
    @Query("""
            select p from Payment p
            where p.deletedAt is null
              and (:proposalId is null or p.proposal.id = :proposalId)
              and (:method is null or p.method = :method)
              and (:dateFiltered = false or p.paymentDate = :paymentDate)
            order by p.paymentDate desc, p.createdAt desc
            """)
    List<Payment> findMatching(@Param("proposalId") UUID proposalId,
            @Param("method") PaymentMethod method,
            @Param("paymentDate") LocalDate paymentDate,
            @Param("dateFiltered") boolean dateFiltered);

    /** Sum of the active payments of one proposal; 0 when there is none. */
    @Query("""
            select coalesce(sum(p.amount), 0) from Payment p
            where p.deletedAt is null and p.proposal.id = :proposalId
            """)
    BigDecimal sumActiveByProposalId(@Param("proposalId") UUID proposalId);

    /** Same sum for several proposals at once (avoids N+1 on list endpoints). */
    @Query("""
            select p.proposal.id, coalesce(sum(p.amount), 0) from Payment p
            where p.deletedAt is null and p.proposal.id in :proposalIds
            group by p.proposal.id
            """)
    List<Object[]> sumActiveByProposalIds(@Param("proposalIds") Collection<UUID> proposalIds);
}
