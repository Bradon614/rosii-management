package mg.rosii.management.demand;

import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;

import org.hibernate.annotations.UuidGenerator;

/**
 * Event-specific information for an EVENT demand (Feature 06). One demand has
 * zero or one of these.
 *
 * <p>The requested-service flags are nullable {@link Boolean} on purpose:
 * {@code true} = explicitly requested, {@code false} = explicitly declined,
 * {@code null} = not specified yet.
 *
 * <p>No audit/version/soft-delete columns: this record's lifecycle is fully
 * owned by its demand (cascade + orphan removal), and it is never addressed
 * through its own API. Keeping it minimal is the simplest consistent model.
 */
@Entity
@Table(name = "demand_event_details")
public class DemandEventDetails {

    @Id
    @UuidGenerator
    @Column(nullable = false, updatable = false)
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "demand_id", nullable = false, unique = true, updatable = false)
    private Demand demand;

    @Column(name = "event_type", nullable = false, length = 100)
    private String eventType;

    @Column(name = "hall_needed")
    private Boolean hallNeeded;

    @Column(name = "desired_hall", length = 200)
    private String desiredHall;

    @Column(name = "catering_requested")
    private Boolean cateringRequested;

    @Column(name = "decoration_requested")
    private Boolean decorationRequested;

    @Column(name = "florist_requested")
    private Boolean floristRequested;

    @Column(name = "equipment_rental_requested")
    private Boolean equipmentRentalRequested;

    @Column(name = "transport_requested")
    private Boolean transportRequested;

    @Column(length = 500)
    private String theme;

    @Column
    private String notes;

    public UUID getId() {
        return id;
    }

    public Demand getDemand() {
        return demand;
    }

    public void setDemand(Demand demand) {
        this.demand = demand;
    }

    public String getEventType() {
        return eventType;
    }

    public void setEventType(String eventType) {
        this.eventType = eventType;
    }

    public Boolean getHallNeeded() {
        return hallNeeded;
    }

    public void setHallNeeded(Boolean hallNeeded) {
        this.hallNeeded = hallNeeded;
    }

    public String getDesiredHall() {
        return desiredHall;
    }

    public void setDesiredHall(String desiredHall) {
        this.desiredHall = desiredHall;
    }

    public Boolean getCateringRequested() {
        return cateringRequested;
    }

    public void setCateringRequested(Boolean cateringRequested) {
        this.cateringRequested = cateringRequested;
    }

    public Boolean getDecorationRequested() {
        return decorationRequested;
    }

    public void setDecorationRequested(Boolean decorationRequested) {
        this.decorationRequested = decorationRequested;
    }

    public Boolean getFloristRequested() {
        return floristRequested;
    }

    public void setFloristRequested(Boolean floristRequested) {
        this.floristRequested = floristRequested;
    }

    public Boolean getEquipmentRentalRequested() {
        return equipmentRentalRequested;
    }

    public void setEquipmentRentalRequested(Boolean equipmentRentalRequested) {
        this.equipmentRentalRequested = equipmentRentalRequested;
    }

    public Boolean getTransportRequested() {
        return transportRequested;
    }

    public void setTransportRequested(Boolean transportRequested) {
        this.transportRequested = transportRequested;
    }

    public String getTheme() {
        return theme;
    }

    public void setTheme(String theme) {
        this.theme = theme;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }
}
