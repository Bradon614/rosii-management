package mg.rosii.management.paymentreceipt;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * All queries exclude soft-deleted receipts explicitly (no global Hibernate
 * filter, per docs/database-conventions.md). Listing is chronological
 * (receiptNumber ascending: REC-YYYY-NNNN sorts in issuance order).
 */
public interface PaymentReceiptRepository extends JpaRepository<PaymentReceipt, UUID> {

    Optional<PaymentReceipt> findByIdAndDeletedAtIsNull(UUID id);

    /** One active receipt per payment (the rule of Feature 12). */
    boolean existsByPaymentIdAndDeletedAtIsNull(UUID paymentId);

    /**
     * Listing with optional combined filters; null parameters mean "no filter"
     * (same repository-wide pattern as the other list endpoints).
     */
    @Query("""
            select r from PaymentReceipt r
            where r.deletedAt is null
              and (:paymentId is null or r.payment.id = :paymentId)
              and (:receiptNumber is null or r.receiptNumber = :receiptNumber)
            order by r.receiptNumber asc, r.createdAt asc
            """)
    List<PaymentReceipt> findMatching(@Param("paymentId") UUID paymentId,
            @Param("receiptNumber") String receiptNumber);

    /**
     * Highest receipt number of one year prefix (e.g. REC-2026-), over ALL rows
     * including soft-deleted ones: numbers are never reused after deletion, so
     * the per-year sequence only moves forward. The unique index on
     * receipt_number is the final guard against concurrent collisions.
     * The trailing '%' matches the NNNN suffix (a bare like would match nothing).
     */
    @Query("select max(r.receiptNumber) from PaymentReceipt r"
            + " where r.receiptNumber like concat(:prefix, '%')")
    String findMaxReceiptNumberStartingWith(@Param("prefix") String prefix);
}