package mg.rosii.management.closure;

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

import mg.rosii.management.preparation.Preparation;

import org.hibernate.annotations.UuidGenerator;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

/**
 * Official closure of a service (Feature 11): the final step after
 * {@code ACCEPTED deposit reached -> preparation -> execution COMPLETED}. One
 * active closure per preparation (partial unique index in V10).
 *
 * <p>It references the preparation only — no commercial or financial data is
 * duplicated (billing, refunds, notifications and statistics are explicitly out
 * of scope) and carries no employee, task or document data: none of that is
 * defined by the business rules.
 *
 * <p>{@code closedAt} is stamped by the server at creation, is never
 * client-provided and can never be modified ({@code updatable = false} plus the
 * service rule: an active closure answers 409 to every PUT). {@code finalNotes}
 * is an optional free remark (max 2000 chars, API-validated).
 *
 * <p>Follows docs/database-conventions.md: application-generated UUID id, UTC
 * audit timestamps, {@code @Version} optimistic locking, soft deletion.
 */
@Entity
@Table(name = "service_closures")
@EntityListeners(AuditingEntityListener.class)
public class ServiceClosure {

    @Id
    @UuidGenerator
    @Column(nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "preparation_id", nullable = false, updatable = false)
    private Preparation preparation;

    /** Chosen once at creation (default COMPLETED); never modified afterwards. */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ClosureStatus status = ClosureStatus.COMPLETED;

    /** Stamped by the server at creation; never client-provided, never modified. */
    @Column(name = "closed_at", nullable = false, updatable = false)
    private OffsetDateTime closedAt;

    /** Optional final remark (<= 2000 chars, enforced by API validation). */
    @Column
    private String finalNotes;

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

    public Preparation getPreparation() {
        return preparation;
    }

    public void setPreparation(Preparation preparation) {
        this.preparation = preparation;
    }

    public ClosureStatus getStatus() {
        return status;
    }

    public void setStatus(ClosureStatus status) {
        this.status = status;
    }

    public OffsetDateTime getClosedAt() {
        return closedAt;
    }

    public void setClosedAt(OffsetDateTime closedAt) {
        this.closedAt = closedAt;
    }

    public String getFinalNotes() {
        return finalNotes;
    }

    public void setFinalNotes(String finalNotes) {
        this.finalNotes = finalNotes;
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

    /** Soft deletion: the row stays for history and the 1:1 slot is released. */
    public void markDeleted() {
        this.deletedAt = OffsetDateTime.now();
    }
}