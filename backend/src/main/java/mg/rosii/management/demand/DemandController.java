package mg.rosii.management.demand;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import jakarta.validation.Valid;

import mg.rosii.management.demand.dto.CreateDemandRequest;
import mg.rosii.management.demand.dto.DemandResponse;
import mg.rosii.management.demand.dto.UpdateDemandRequest;

import org.springframework.dao.OptimisticLockingFailureException;
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
 * Demand API. Requires authentication via the existing security config (no
 * permitAll additions); V1 single-role PATRONNE.
 */
@RestController
@RequestMapping("/api/demands")
public class DemandController {

    private final DemandService demandService;

    public DemandController(DemandService demandService) {
        this.demandService = demandService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public DemandResponse create(@Valid @RequestBody CreateDemandRequest request) {
        return demandService.create(request);
    }

    @GetMapping
    public List<DemandResponse> list(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) UUID clientId,
            @RequestParam(required = false) DemandType type,
            @RequestParam(required = false) DemandStatus status) {
        return demandService.list(search, clientId, type, status);
    }

    @GetMapping("/{id}")
    public DemandResponse get(@PathVariable UUID id) {
        return demandService.get(id);
    }

    @PutMapping("/{id}")
    public DemandResponse update(@PathVariable UUID id, @Valid @RequestBody UpdateDemandRequest request) {
        return demandService.update(id, request);
    }

    /** Soft delete: the demand disappears from the API but the row is kept. */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        demandService.delete(id);
    }

    /** True concurrent update caught by @Version at flush — clean 409. */
    @ExceptionHandler(OptimisticLockingFailureException.class)
    public ResponseEntity<Map<String, String>> handleConcurrentModification(
            OptimisticLockingFailureException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", "demand was modified concurrently; reload and retry"));
    }
}
