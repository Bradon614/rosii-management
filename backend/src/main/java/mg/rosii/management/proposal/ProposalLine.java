package mg.rosii.management.proposal;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import mg.rosii.management.service.Service;

import org.hibernate.annotations.UuidGenerator;

/**
 * One priced line of a proposal/quote (Feature 07).
 *
 * <p>The catalogue {@link Service} reference is optional and is only a link:
 * {@code description}, {@code unit} and {@code unitPrice} are line-owned
 * snapshot values seeded from the catalogue while the proposal is a DRAFT and
 * never re-read afterwards, so a later catalogue change cannot alter what was
 * proposed to the client.
 *
 * <p>No audit/version/soft-delete columns: the line's lifecycle is fully owned
 * by its proposal (cascade + orphan removal), like DemandEventDetails.
 */
@Entity
@Table(name = "proposal_lines")
public class ProposalLine {

    @Id
    @UuidGenerator
    @Column(nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "proposal_id", nullable = false, updatable = false)
    private Proposal proposal;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "service_id")
    private Service service;

    @Column(nullable = false, length = 500)
    private String description;

    @Column(nullable = false, length = 50)
    private String unit;

    @Column(nullable = false, precision = 14, scale = 3)
    private BigDecimal quantity;

    @Column(name = "unit_price", nullable = false, precision = 14, scale = 2)
    private BigDecimal unitPrice;

    @Column
    private String notes;

    public UUID getId() {
        return id;
    }

    public Proposal getProposal() {
        return proposal;
    }

    public void setProposal(Proposal proposal) {
        this.proposal = proposal;
    }

    public Service getService() {
        return service;
    }

    public void setService(Service service) {
        this.service = service;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getUnit() {
        return unit;
    }

    public void setUnit(String unit) {
        this.unit = unit;
    }

    public BigDecimal getQuantity() {
        return quantity;
    }

    public void setQuantity(BigDecimal quantity) {
        this.quantity = quantity;
    }

    public BigDecimal getUnitPrice() {
        return unitPrice;
    }

    public void setUnitPrice(BigDecimal unitPrice) {
        this.unitPrice = unitPrice;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    /** quantity × unitPrice, rounded to 2 decimals (HALF_UP); never stored. */
    public BigDecimal getLineTotal() {
        return quantity.multiply(unitPrice).setScale(2, RoundingMode.HALF_UP);
    }
}
