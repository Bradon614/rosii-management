package mg.rosii.management.client;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

import mg.rosii.management.client.dto.ClientResponse;
import mg.rosii.management.client.dto.CreateClientRequest;
import mg.rosii.management.client.dto.UpdateClientRequest;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Client management (online only; offline/sync are later features).
 * Normalization rules: name/phones/notes are trimmed, email is trimmed and
 * lower-cased, blank optional values become null.
 */
@Service
public class ClientService {

    private final ClientRepository clients;

    public ClientService(ClientRepository clients) {
        this.clients = clients;
    }

    @Transactional
    public ClientResponse create(CreateClientRequest request) {
        Client client = new Client();
        applyEditableFields(client, request.name(), request.phone1(), request.phone2(),
                request.email(), request.notes());
        return ClientResponse.from(clients.save(client));
    }

    @Transactional(readOnly = true)
    public ClientResponse get(UUID id) {
        return ClientResponse.from(findActive(id));
    }

    /** Lists active clients; a non-blank {@code search} filters them. */
    @Transactional(readOnly = true)
    public List<ClientResponse> list(String search) {
        String term = search == null ? "" : search.trim();
        List<Client> found = term.isEmpty()
                ? clients.findAllActive()
                : clients.searchActive(likePattern(term));
        return found.stream().map(ClientResponse::from).toList();
    }

    @Transactional
    public ClientResponse update(UUID id, UpdateClientRequest request) {
        Client client = findActive(id);
        applyEditableFields(client, request.name(), request.phone1(), request.phone2(),
                request.email(), request.notes());
        // Flush so the response carries the incremented @Version, not the stale one.
        return ClientResponse.from(clients.saveAndFlush(client));
    }

    /** Soft deletion: sets deletedAt; the row remains in PostgreSQL. */
    @Transactional
    public void delete(UUID id) {
        findActive(id).markDeleted();
    }

    private Client findActive(UUID id) {
        return clients.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "client not found"));
    }

    private static void applyEditableFields(Client client, String name, String phone1,
            String phone2, String email, String notes) {
        client.setName(name.trim());
        client.setPhone1(phone1.trim());
        client.setPhone2(trimToNull(phone2));
        client.setEmail(normalizeEmail(email));
        client.setNotes(trimToNull(notes));
    }

    private static String normalizeEmail(String email) {
        String trimmed = trimToNull(email);
        return trimmed == null ? null : trimmed.toLowerCase(Locale.ROOT);
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
