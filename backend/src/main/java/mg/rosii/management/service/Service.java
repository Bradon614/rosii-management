package mg.rosii.management.service;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import org.hibernate.annotations.UuidGenerator;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

/**
 * A service ROSII can commercially offer (Feature 05 catalogue).
 *
 * <p>{@code referencePrice} is the catalogue reference price only — it is not a
 * negotiated price and carries no pricing logic; future Proposal/Quote records
 * will keep their own historical prices.
 *
 * <p>{@code active} is a commercial flag (offered or not); it is distinct from
 * soft deletion ({@code deletedAt}), which retires the record entirely.
 *
 * <p>Follows docs/database-conventions.md: application-generated UUID id, UTC
 * audit timestamps, {@code @Version} optimistic locking, soft deletion.
 */
@Entity
@Table(name = "services")
@EntityListeners(AuditingEntityListener.class)
public class Service {

    @Id
    @UuidGenerator
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(nullable = false, length = 200)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private ServiceCategory category;

    @Column
    private String description;

    @Column(name = "default_unit", nullable = false, length = 50)
    private String defaultUnit;

    @Column(name = "reference_price", nullable = false, precision = 14, scale = 2)
    private BigDecimal referencePrice;

    @Column(nullable = false)
    private boolean active = true;

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

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public ServiceCategory getCategory() {
        return category;
    }

    public void setCategory(ServiceCategory category) {
        this.category = category;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getDefaultUnit() {
        return defaultUnit;
    }

    public void setDefaultUnit(String defaultUnit) {
        this.defaultUnit = defaultUnit;
    }

    public BigDecimal getReferencePrice() {
        return referencePrice;
    }

    public void setReferencePrice(BigDecimal referencePrice) {
        this.referencePrice = referencePrice;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
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

    /** Soft deletion: the row stays so future synchronization can replicate it. */
    public void markDeleted() {
        this.deletedAt = OffsetDateTime.now();
    }
}
