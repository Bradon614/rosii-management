package mg.rosii.management.client;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import jakarta.validation.Valid;

import mg.rosii.management.client.dto.ClientResponse;
import mg.rosii.management.client.dto.CreateClientRequest;
import mg.rosii.management.client.dto.UpdateClientRequest;

import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Client API. Requires authentication (the existing security config protects
 * everything except health/auth endpoints); V1 single-role PATRONNE.
 */
@RestController
@RequestMapping("/api/clients")
public class ClientController {

    private final ClientService clientService;

    public ClientController(ClientService clientService) {
        this.clientService = clientService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ClientResponse create(@Valid @RequestBody CreateClientRequest request) {
        return clientService.create(request);
    }

    @GetMapping
    public List<ClientResponse> list(@RequestParam(required = false) String search) {
        return clientService.list(search);
    }

    @GetMapping("/{id}")
    public ClientResponse get(@PathVariable UUID id) {
        return clientService.get(id);
    }

    @PutMapping("/{id}")
    public ClientResponse update(@PathVariable UUID id, @Valid @RequestBody UpdateClientRequest request) {
        return clientService.update(id, request);
    }

    /** Soft delete: the client disappears from the API but the row is kept. */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        clientService.delete(id);
    }

    /** Concurrent update detected by @Version — a clean 409, never a stack trace. */
    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    public ResponseEntity<Map<String, String>> handleConcurrentModification(
            ObjectOptimisticLockingFailureException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", "client was modified concurrently; reload and retry"));
    }
}
