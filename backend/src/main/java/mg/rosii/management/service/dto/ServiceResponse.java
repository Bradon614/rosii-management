package mg.rosii.management.service.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

import mg.rosii.management.service.Service;
import mg.rosii.management.service.ServiceCategory;

/**
 * Catalogue service representation. {@code version} is exposed read-only so
 * clients can supply it on update for optimistic locking.
 */
public record ServiceResponse(
        UUID id,
        String name,
        ServiceCategory category,
        String description,
        String defaultUnit,
        BigDecimal referencePrice,
        boolean active,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        long version) {

    public static ServiceResponse from(Service service) {
        return new ServiceResponse(
                service.getId(),
                service.getName(),
                service.getCategory(),
                service.getDescription(),
                service.getDefaultUnit(),
                service.getReferencePrice(),
                service.isActive(),
                service.getCreatedAt(),
                service.getUpdatedAt(),
                service.getVersion());
    }
}
