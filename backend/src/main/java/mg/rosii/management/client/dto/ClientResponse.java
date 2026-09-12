package mg.rosii.management.client.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

import mg.rosii.management.client.Client;

/**
 * Client representation. {@code version} is exposed read-only so clients can
 * detect staleness; it is never accepted as input.
 */
public record ClientResponse(
        UUID id,
        String name,
        String phone1,
        String phone2,
        String email,
        String notes,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        long version) {

    public static ClientResponse from(Client client) {
        return new ClientResponse(
                client.getId(),
                client.getName(),
                client.getPhone1(),
                client.getPhone2(),
                client.getEmail(),
                client.getNotes(),
                client.getCreatedAt(),
                client.getUpdatedAt(),
                client.getVersion());
    }
}
