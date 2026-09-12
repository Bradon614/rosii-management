package mg.rosii.management.service;

import java.math.BigDecimal;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import mg.rosii.management.service.dto.CreateServiceRequest;
import mg.rosii.management.service.dto.ServiceResponse;
import mg.rosii.management.service.dto.SetActiveRequest;
import mg.rosii.management.service.dto.UpdateServiceRequest;

import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Catalogue business logic (online only; sync is a later feature).
 *
 * <p>Normalization mirrors Feature 04: trim inputs, blank optionals become
 * null, LIKE wildcards in search terms are escaped.
 *
 * <p>The class-level annotation is fully qualified because the entity
 * {@link Service} lives in this same package and would shadow the Spring
 * annotation's simple name.
 */
@org.springframework.stereotype.Service
public class ServiceService {

    private final ServiceRepository services;

    public ServiceService(ServiceRepository services) {
        this.services = services;
    }

    @Transactional
    public ServiceResponse create(CreateServiceRequest request) {
        Service service = new Service();
        applyContent(service, request.name(), request.category(), request.description(),
                request.defaultUnit(), request.referencePrice());
        service.setActive(request.active() == null || request.active());
        return ServiceResponse.from(services.save(service));
    }

    @Transactional(readOnly = true)
    public ServiceResponse get(UUID id) {
        return ServiceResponse.from(findActive(id));
    }

    /** Lists non-deleted services with optional combined search/category/active filters. */
    @Transactional(readOnly = true)
    public List<ServiceResponse> list(String search, ServiceCategory category, Boolean active) {
        String pattern = search == null || search.isBlank() ? null : likePattern(search.trim());
        return services.findMatching(pattern, category, active).stream()
                .map(ServiceResponse::from)
                .toList();
    }

    @Transactional
    public ServiceResponse update(UUID id, UpdateServiceRequest request) {
        Service service = findActive(id);
        if (request.version() != service.getVersion()) {
            throw conflict();
        }
        applyContent(service, request.name(), request.category(), request.description(),
                request.defaultUnit(), request.referencePrice());
        // Flush so the response carries the incremented @Version, not the stale one.
        return ServiceResponse.from(services.saveAndFlush(service));
    }

    /** Activate/deactivate without touching content fields. */
    @Transactional
    public ServiceResponse setActive(UUID id, SetActiveRequest request) {
        Service service = findActive(id);
        service.setActive(request.active());
        return ServiceResponse.from(services.saveAndFlush(service));
    }

    /** Soft deletion: sets deletedAt; the row remains in PostgreSQL. */
    @Transactional
    public void delete(UUID id) {
        findActive(id).markDeleted();
    }

    private Service findActive(UUID id) {
        return services.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "service not found"));
    }

    private static void applyContent(Service service, String name, ServiceCategory category,
            String description, String defaultUnit, BigDecimal referencePrice) {
        service.setName(name.trim());
        service.setCategory(category);
        service.setDescription(trimToNull(description));
        service.setDefaultUnit(defaultUnit.trim());
        service.setReferencePrice(referencePrice);
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

    private static ResponseStatusException conflict() {
        return new ResponseStatusException(HttpStatus.CONFLICT,
                "service was modified concurrently; reload with the current version and retry");
    }
}
