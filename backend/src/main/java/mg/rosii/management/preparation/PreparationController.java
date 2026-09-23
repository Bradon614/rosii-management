package mg.rosii.management.preparation;

import java.util.Map;
import java.util.UUID;

import jakarta.validation.Valid;

import mg.rosii.management.preparation.dto.CreatePreparationRequest;
import mg.rosii.management.preparation.dto.PreparationResponse;

import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Preparation API. Requires authentication via the existing security config (no
 * permitAll additions); V1 single-role PATRONNE. Only the endpoints of the real
 * preparation scope exist: create, read (by id or proposal) and soft delete.
 */
@RestController
@RequestMapping("/api/preparations")
public class PreparationController {

    private final PreparationService preparationService;

    public PreparationController(PreparationService preparationService) {
        this.preparationService = preparationService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PreparationResponse create(@Valid @RequestBody CreatePreparationRequest request) {
        return preparationService.create(request);
    }

    @GetMapping("/{id}")
    public PreparationResponse get(@PathVariable UUID id) {
        return preparationService.get(id);
    }

    /** The preparation linked to a proposal: /api/preparations?proposalId=... */
    @GetMapping(params = "proposalId")
    public PreparationResponse getByProposal(@RequestParam UUID proposalId) {
        return preparationService.getByProposal(proposalId);
    }

    /** Soft delete: the preparation disappears from the API but the row is kept. */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        preparationService.delete(id);
    }

    /** True concurrent modification caught by @Version at flush — clean 409. */
    @ExceptionHandler(OptimisticLockingFailureException.class)
    public ResponseEntity<Map<String, String>> handleConcurrentModification(
            OptimisticLockingFailureException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", "preparation was modified concurrently; reload and retry"));
    }
}
