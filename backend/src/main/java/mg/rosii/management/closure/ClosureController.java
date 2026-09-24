package mg.rosii.management.closure;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import jakarta.validation.Valid;

import mg.rosii.management.closure.dto.ClosureResponse;
import mg.rosii.management.closure.dto.CreateClosureRequest;
import mg.rosii.management.closure.dto.UpdateClosureRequest;

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
 * Closure API. Requires authentication via the existing security config (no
 * permitAll additions); V1 single-role PATRONNE. Only the endpoints of the real
 * closure scope exist: create, read (by id or filtered list), update (always
 * 409 on an active closure: it is definitive) and soft delete.
 */
@RestController
@RequestMapping("/api/closures")
public class ClosureController {

    private final ClosureService closureService;

    public ClosureController(ClosureService closureService) {
        this.closureService = closureService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ClosureResponse create(@Valid @RequestBody CreateClosureRequest request) {
        return closureService.create(request);
    }

    /** Optional combined filters: /api/closures?preparationId=&status= */
    @GetMapping
    public List<ClosureResponse> list(
            @RequestParam(required = false) UUID preparationId,
            @RequestParam(required = false) ClosureStatus status) {
        return closureService.list(preparationId, status);
    }

    @GetMapping("/{id}")
    public ClosureResponse get(@PathVariable UUID id) {
        return closureService.get(id);
    }

    /** Always 409 for an active closure: it is definitive and closedAt never changes. */
    @PutMapping("/{id}")
    public ClosureResponse update(@PathVariable UUID id, @Valid @RequestBody UpdateClosureRequest request) {
        return closureService.update(id, request);
    }

    /** Soft delete: the closure disappears from the API but the row is kept. */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        closureService.delete(id);
    }

    /** True concurrent modification caught by @Version at flush — clean 409. */
    @ExceptionHandler(OptimisticLockingFailureException.class)
    public ResponseEntity<Map<String, String>> handleConcurrentModification(
            OptimisticLockingFailureException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", "service closure was modified concurrently; reload and retry"));
    }
}