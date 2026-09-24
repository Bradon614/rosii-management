package mg.rosii.management.paymentreceipt;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import mg.rosii.management.payment.Payment;
import mg.rosii.management.payment.PaymentMethod;

import org.hibernate.annotations.UuidGenerator;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

/**
 * Receipt of a payment (Feature 12): a justificatif with a unique human number
 * (REC-YYYY-NNNN, backend-generated only). One active receipt per payment
 * (partial unique index in V11).
 *
 * <p>The receipt is an immutable historical document: it carries a SNAPSHOT of
 * the payment at issuance ({@code amount}, {@code paymentMethod},
 * {@code paymentDate}, {@code paymentReference}) plus the reference to the
 * original payment, so consultations never depend on the current payment row
 * and no field is ever recalculated from it. There is deliberately no PUT
 * endpoint: nothing can be modified after creation (all snapshot columns are
 * {@code updatable = false} as well), and only soft delete is allowed — the
 * receipt number of a deleted row is never reused.
 *
 * <p>Context path to the enterprise is Payment -&gt; Proposal -&gt; Client;
 * client data is never duplicated here. No PDF, signature or notification is
 * produced (out of scope).
 *
 * <p>Follows docs/database-conventions.md: application-generated UUID id, UTC
 * audit timestamps, {@code @Version} optimistic locking, soft deletion.
 */
@Entity
@Table(name = "payment_receipts")
@EntityListeners(AuditingEntityListener.class)
public class PaymentReceipt {

    @Id
    @UuidGenerator
    @Column(nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "payment_id", nullable = false, updatable = false)
    private Payment payment;

    /** Backend-generated REC-YYYY-NNNN; never client-provided, never reused. */
    @Column(name = "receipt_number", nullable = false, length = 30, updatable = false)
    private String receiptNumber;

    /** Snapshot of the payment amount at issuance. */
    @Column(nullable = false, precision = 14, scale = 2, updatable = false)
    private BigDecimal amount;

    /** Snapshot of the payment method at issuance (Feature 08 enum, reused as-is). */
    @Enumerated(EnumType.STRING)
    @Column(name = "payment_method", nullable = false, length = 30, updatable = false)
    private PaymentMethod paymentMethod;

    /** Snapshot of the payment date at issuance. */
    @Column(name = "payment_date", nullable = false, updatable = false)
    private LocalDate paymentDate;

    /** Snapshot of the payment reference at issuance (may be null on the payment). */
    @Column(name = "payment_reference", length = 255, updatable = false)
    private String paymentReference;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @Version
    @Column(nullable = false)
    private long version;

    @Column(name = "deleted_at")
    private OffsetDateTime deletedAt;

    public UUID getId() {
        return id;
    }

    public Payment getPayment() {
        return payment;
    }

    public void setPayment(Payment payment) {
        this.payment = payment;
    }

    public String getReceiptNumber() {
        return receiptNumber;
    }

    public void setReceiptNumber(String receiptNumber) {
        this.receiptNumber = receiptNumber;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }

    public PaymentMethod getPaymentMethod() {
        return paymentMethod;
    }

    public void setPaymentMethod(PaymentMethod paymentMethod) {
        this.paymentMethod = paymentMethod;
    }

    public LocalDate getPaymentDate() {
        return paymentDate;
    }

    public void setPaymentDate(LocalDate paymentDate) {
        this.paymentDate = paymentDate;
    }

    public String getPaymentReference() {
        return paymentReference;
    }

    public void setPaymentReference(String paymentReference) {
        this.paymentReference = paymentReference;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public long getVersion() {
        return version;
    }

    public OffsetDateTime getDeletedAt() {
        return deletedAt;
    }

    /** Soft deletion: the row (and its number) stays for history; the slot is released. */
    public void markDeleted() {
        this.deletedAt = OffsetDateTime.now();
    }
}