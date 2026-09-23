package mg.rosii.management.preparation;

import java.time.OffsetDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import mg.rosii.management.proposal.Proposal;

import org.hibernate.annotations.UuidGenerator;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

/**
 * The first operational layer (Feature 09): an ACCEPTED proposal whose
 * required deposit has been reached may enter preparation.
 *
 * <p>It only references the proposal, never duplicates its commercial or
 * financial data (Feature 08 keeps owning deposit/totals), and carries no
 * task, assignment, planning or execution fields — those are not defined by
 * the business rules.
 *
 * <p>Follows docs/database-conventions.md: application-generated UUID id, UTC
 * audit timestamps, {@code @Version} optimistic locking, soft deletion. One
 * active preparation per proposal (partial unique index in V8).
 */
@Entity
@Table(name = "preparations")
@EntityListeners(AuditingEntityListener.class)
public class Preparation {

    @Id
    @UuidGenerator
    @Column(nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "proposal_id", nullable = false, updatable = false)
    private Proposal proposal;

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

    public Proposal getProposal() {
        return proposal;
    }

    public void setProposal(Proposal proposal) {
        this.proposal = proposal;
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

    /** Soft deletion: the row stays for synchronization and history. */
    public void markDeleted() {
        this.deletedAt = OffsetDateTime.now();
    }
}
