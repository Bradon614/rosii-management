package mg.rosii.management.execution;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import jakarta.validation.Valid;

import mg.rosii.management.execution.dto.CancelExecutionRequest;
import mg.rosii.management.execution.dto.CancellationResponse;
import mg.rosii.management.execution.dto.CreateExecutionRequest;
import mg.rosii.management.execution.dto.ExecutionAvailabilityResponse;
import mg.rosii.management.execution.dto.ExecutionResponse;
import mg.rosii.management.execution.dto.UpdateExecutionRequest;
import mg.rosii.management.execution.dto.UpdateExecutionStatusRequest;
import mg.rosii.management.execution.dto.UpdateScheduledDateRequest;

import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.format.annotation.DateTimeFormat;
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
 * Execution API. Requires authentication via the existing security config (no
 * permitAll additions); V1 single-role PATRONNE. Only the endpoints of the real
 * execution scope exist: create, read (by id or filtered list), operational-info
 * update, status transition and soft delete.
 */
@RestController
@RequestMapping("/api/executions")
public class ExecutionController {

    private final ExecutionService executionService;

    public ExecutionController(ExecutionService executionService) {
        this.executionService = executionService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ExecutionResponse create(@Valid @RequestBody CreateExecutionRequest request) {
        return executionService.create(request);
    }

    /** Optional combined filters: /api/executions?preparationId=&status=&scheduledDate= */
    @GetMapping
    public List<ExecutionResponse> list(
            @RequestParam(required = false) UUID preparationId,
            @RequestParam(required = false) ExecutionStatus status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate scheduledDate) {
        return executionService.list(preparationId, status, scheduledDate);
    }

    /**
     * Feature 16 — availability check for one service date: is the date
     * already occupied by another active execution (PLANNED or IN_PROGRESS)?
     * {@code excludeExecutionId} optionally ignores one execution (404 when
     * unknown or soft-deleted) so an existing service can be moved to its own
     * date without a false conflict.
     */
    @GetMapping("/availability")
    public ExecutionAvailabilityResponse availability(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate scheduledDate,
            @RequestParam(required = false) UUID excludeExecutionId) {
        return executionService.checkAvailability(scheduledDate, excludeExecutionId);
    }

    @GetMapping("/{id}")
    public ExecutionResponse get(@PathVariable UUID id) {
        return executionService.get(id);
    }

    @PutMapping("/{id}")
    public ExecutionResponse update(@PathVariable UUID id, @Valid @RequestBody UpdateExecutionRequest request) {
        return executionService.update(id, request);
    }

    /** Status transitions go through the strict state machine only. */
    @PatchMapping("/{id}/status")
    public ExecutionResponse setStatus(@PathVariable UUID id,
            @Valid @RequestBody UpdateExecutionStatusRequest request) {
        return executionService.changeStatus(id, request.status());
    }

    /** Soft delete: the execution disappears from the API but the row is kept. */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        executionService.delete(id);
    }

    /**
     * Feature 15 — modifies the service date while PLANNED and up to J-5
     * included (current date minus 5 days must be today or later; otherwise
     * 409). Refused for IN_PROGRESS, COMPLETED and CANCELLED executions.
     */
    @PatchMapping("/{id}/scheduled-date")
    public ExecutionResponse reschedule(@PathVariable UUID id,
            @Valid @RequestBody UpdateScheduledDateRequest request) {
        return executionService.reschedule(id, request);
    }

    /**
     * Feature 15 — cancels a PLANNED service: status becomes CANCELLED
     * (terminal), cancelledAt is stamped server-side, the optional reason is
     * stored, and the response carries the derived amounts (25% of the
     * proposal total retained, potential refund floored at 0). No payment,
     * receipt or invoice is ever modified or deleted.
     */
    @PatchMapping("/{id}/cancel")
    public CancellationResponse cancel(@PathVariable UUID id,
            @Valid @RequestBody CancelExecutionRequest request) {
        return executionService.cancel(id, request);
    }

    /** True concurrent modification caught by @Version at flush — clean 409. */
    @ExceptionHandler(OptimisticLockingFailureException.class)
    public ResponseEntity<Map<String, String>> handleConcurrentModification(
            OptimisticLockingFailureException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", "execution was modified concurrently; reload and retry"));
    }
}