package mg.rosii.management.invoice;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * All queries exclude soft-deleted invoices explicitly (no global Hibernate
 * filter, per docs/database-conventions.md). Listing is chronological
 * (invoiceNumber ascending: FAC-YYYY-NNNN sorts in issuance order).
 */
public interface InvoiceRepository extends JpaRepository<Invoice, UUID> {

    Optional<Invoice> findByIdAndDeletedAtIsNull(UUID id);

    /** One active invoice per payment (the rule of Feature 13). */
    boolean existsByPaymentIdAndDeletedAtIsNull(UUID paymentId);

    /**
     * Listing with optional combined filters; null parameters mean "no filter"
     * (same repository-wide pattern as the other list endpoints).
     */
    @Query("""
            select i from Invoice i
            where i.deletedAt is null
              and (:paymentId is null or i.payment.id = :paymentId)
              and (:invoiceNumber is null or i.invoiceNumber = :invoiceNumber)
            order by i.invoiceNumber asc, i.createdAt asc
            """)
    List<Invoice> findMatching(@Param("paymentId") UUID paymentId,
            @Param("invoiceNumber") String invoiceNumber);

    /**
     * Highest invoice number of one year prefix (e.g. FAC-2026-), over ALL rows
     * including soft-deleted ones: numbers are never reused after deletion, so
     * the per-year sequence only moves forward. The unique index on
     * invoice_number is the final guard against concurrent collisions.
     * The trailing '%' matches the NNNN suffix (a bare like would match nothing).
     */
    @Query("select max(i.invoiceNumber) from Invoice i"
            + " where i.invoiceNumber like concat(:prefix, '%')")
    String findMaxInvoiceNumberStartingWith(@Param("prefix") String prefix);
}