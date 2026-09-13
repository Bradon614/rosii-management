package mg.rosii.management.demand;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import mg.rosii.management.client.Client;
import mg.rosii.management.client.ClientRepository;
import mg.rosii.management.demand.dto.CreateDemandRequest;
import mg.rosii.management.demand.dto.DemandEventDetailsRequest;
import mg.rosii.management.demand.dto.DemandResponse;
import mg.rosii.management.demand.dto.UpdateDemandRequest;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Demand business logic (Feature 06): "what did the client request?" — no
 * proposal, quote, reservation or availability behavior lives here.
 *
 * <p>Statuses are free-form corrections by the patronne: no state machine is
 * enforced. Budget consistency is validated here (400), never silently repaired.
 */
@Service
public class DemandService {

    private final DemandRepository demands;
    private final ClientRepository clients;

    public DemandService(DemandRepository demands, ClientRepository clients) {
        this.demands = demands;
        this.clients = clients;
    }

    @Transactional
    public DemandResponse create(CreateDemandRequest request) {
        Client client = findActiveClient(request.clientId());
        Demand demand = new Demand();
        demand.setClient(client);
        demand.setType(request.type());
        demand.setStatus(request.status() == null ? DemandStatus.NEW : request.status());
        applyDemandFields(demand, request.requestedDate(), request.estimatedPeople(),
                request.budgetType(), request.budgetMin(), request.budgetMax(),
                request.location(), request.notes());
        applyEventDetails(demand, request.eventDetails());
        return DemandResponse.from(demands.save(demand));
    }

    @Transactional(readOnly = true)
    public DemandResponse get(UUID id) {
        return DemandResponse.from(findActive(id));
    }

    /** Lists non-deleted demands (newest first) with optional combined filters. */
    @Transactional(readOnly = true)
    public List<DemandResponse> list(String search, UUID clientId, DemandType type, DemandStatus status) {
        String pattern = search == null || search.isBlank() ? null : likePattern(search.trim());
        return demands.findMatching(pattern, clientId, type, status).stream()
                .map(DemandResponse::from)
                .toList();
    }

    @Transactional
    public DemandResponse update(UUID id, UpdateDemandRequest request) {
        Demand demand = findActive(id);
        if (request.version() != demand.getVersion()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "demand was modified concurrently; reload with the current version and retry");
        }
        demand.setClient(findActiveClient(request.clientId()));
        demand.setType(request.type());
        demand.setStatus(request.status());
        applyDemandFields(demand, request.requestedDate(), request.estimatedPeople(),
                request.budgetType(), request.budgetMin(), request.budgetMax(),
                request.location(), request.notes());
        applyEventDetails(demand, request.eventDetails());
        // Flush so the response carries the incremented @Version, not the stale one.
        return DemandResponse.from(demands.saveAndFlush(demand));
    }

    /** Soft deletion: sets deletedAt; the row remains in PostgreSQL. */
    @Transactional
    public void delete(UUID id) {
        findActive(id).markDeleted();
    }

    private Demand findActive(UUID id) {
        return demands.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "demand not found"));
    }

    /** Unknown or soft-deleted clients answer 404: no enumeration of client state. */
    private Client findActiveClient(UUID clientId) {
        return clients.findByIdAndDeletedAtIsNull(clientId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "client not found"));
    }

    private static void applyDemandFields(Demand demand, LocalDate requestedDate,
            Integer estimatedPeople, BudgetType budgetType, BigDecimal budgetMin, BigDecimal budgetMax,
            String location, String notes) {
        demand.setRequestedDate(requestedDate);
        demand.setEstimatedPeople(estimatedPeople);
        applyBudget(demand, budgetType, budgetMin, budgetMax);
        demand.setLocation(trimToNull(location));
        demand.setNotes(trimToNull(notes));
    }

    private static void applyBudget(Demand demand, BudgetType budgetType, BigDecimal min, BigDecimal max) {
        BudgetType type = budgetType == null ? BudgetType.NONE : budgetType;
        switch (type) {
            case NONE -> {
                if (min != null || max != null) {
                    throw badRequest("budgetType NONE must not carry budgetMin or budgetMax");
                }
                demand.setBudgetMin(null);
                demand.setBudgetMax(null);
            }
            case EXACT -> {
                if (min == null || max == null) {
                    throw badRequest("budgetType EXACT requires both budgetMin and budgetMax");
                }
                if (min.compareTo(max) != 0) {
                    throw badRequest("budgetType EXACT requires budgetMin equal to budgetMax");
                }
                demand.setBudgetMin(min);
                demand.setBudgetMax(max);
            }
            case RANGE -> {
                if (min == null || max == null) {
                    throw badRequest("budgetType RANGE requires both budgetMin and budgetMax");
                }
                if (min.compareTo(max) >= 0) {
                    throw badRequest("budgetType RANGE requires budgetMin strictly less than budgetMax");
                }
                demand.setBudgetMin(min);
                demand.setBudgetMax(max);
            }
        }
        demand.setBudgetType(type);
    }

    /** Null request clears existing details (orphan removal); a value replaces them. */
    private static void applyEventDetails(Demand demand, DemandEventDetailsRequest request) {
        if (request == null) {
            demand.replaceEventDetails(null);
            return;
        }
        DemandEventDetails details = new DemandEventDetails();
        details.setEventType(request.eventType().trim());
        details.setHallNeeded(request.hallNeeded());
        details.setDesiredHall(trimToNull(request.desiredHall()));
        details.setCateringRequested(request.cateringRequested());
        details.setDecorationRequested(request.decorationRequested());
        details.setFloristRequested(request.floristRequested());
        details.setEquipmentRentalRequested(request.equipmentRentalRequested());
        details.setTransportRequested(request.transportRequested());
        details.setTheme(trimToNull(request.theme()));
        details.setNotes(trimToNull(request.notes()));
        demand.replaceEventDetails(details);
    }

    private static ResponseStatusException badRequest(String reason) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, reason);
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String likePattern(String term) {
        String escaped = term.toLowerCase(Locale.ROOT)
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
        return "%" + escaped + "%";
    }
}
