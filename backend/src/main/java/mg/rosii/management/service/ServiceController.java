package mg.rosii.management.service;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import jakarta.validation.Valid;

import mg.rosii.management.service.dto.CreateServiceRequest;
import mg.rosii.management.service.dto.ServiceResponse;
import mg.rosii.management.service.dto.SetActiveRequest;
import mg.rosii.management.service.dto.UpdateServiceRequest;

import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Catalogue API. Requires authentication via the existing security config
 * (no permitAll additions); V1 single-role PATRONNE.
 */
@RestController
@RequestMapping("/api/services")
public class ServiceController {

    private final ServiceService serviceService;

    public ServiceController(ServiceService serviceService) {
        this.serviceService = serviceService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ServiceResponse create(@Valid @RequestBody CreateServiceRequest request) {
        return serviceService.create(request);
    }

    @GetMapping
    public List<ServiceResponse> list(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) ServiceCategory category,
            @RequestParam(required = false) Boolean active) {
        return serviceService.list(search, category, active);
    }

    @GetMapping("/{id}")
    public ServiceResponse get(@PathVariable UUID id) {
        return serviceService.get(id);
    }

    @PutMapping("/{id}")
    public ServiceResponse update(@PathVariable UUID id, @Valid @RequestBody UpdateServiceRequest request) {
        return serviceService.update(id, request);
    }

    @PatchMapping("/{id}/active")
    public ServiceResponse setActive(@PathVariable UUID id, @Valid @RequestBody SetActiveRequest request) {
        return serviceService.setActive(id, request);
    }

    /** Soft delete: the service disappears from the API but the row is kept. */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        serviceService.delete(id);
    }

    /** True concurrent update caught by @Version at flush — clean 409, never a stack trace. */
    @ExceptionHandler(OptimisticLockingFailureException.class)
    public ResponseEntity<Map<String, String>> handleConcurrentModification(
            OptimisticLockingFailureException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", "service was modified concurrently; reload and retry"));
    }
}
