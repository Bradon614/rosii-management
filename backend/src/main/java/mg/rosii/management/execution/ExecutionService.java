package mg.rosii.management.execution;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

import mg.rosii.management.execution.dto.CancelExecutionRequest;
import mg.rosii.management.execution.dto.CancellationResponse;
import mg.rosii.management.execution.dto.CreateExecutionRequest;
import mg.rosii.management.execution.dto.ExecutionAvailabilityResponse;
import mg.rosii.management.execution.dto.ExecutionResponse;
import mg.rosii.management.execution.dto.UpdateExecutionRequest;
import mg.rosii.management.execution.dto.UpdateScheduledDateRequest;
import mg.rosii.management.payment.PaymentRepository;
import mg.rosii.management.preparation.Preparation;
import mg.rosii.management.preparation.PreparationRepository;
import mg.rosii.management.proposal.Proposal;
import mg.rosii.management.proposal.ProposalStatus;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Execution business logic (Feature 10): the operational layer after
 * {@code ACCEPTED deposit reached -> preparation}.
 *
 * <p>Creation re-checks BOTH workflow gates of Feature 09 — the proposal behind
 * the preparation is ACCEPTED (409) and the required deposit is reached (409,
 * the exact same derived {@code depositReached} check as preparations: sum of
 * the active payments, never stored) — plus the 1:1 rule (one active execution
 * per preparation, 409).
 *
 * <p>Status changes go through the strict state machine only and stamp
 * startedAt/completedAt/cancelledAt server-side. Operational info is editable
 * according to the status (all fields while PLANNED, location/notes only while
 * IN_PROGRESS, nothing once terminal).
 *
 * <p>Feature 16 adds the service availability rule: one active execution
 * (PLANNED or IN_PROGRESS, never soft-deleted) per local service date. It is
 * checked at creation (when a date is provided), on the Feature 15 date
 * modification, and exposed through GET /api/executions/availability. This
 * application-level check is a business rule, not a transactional guarantee:
 * the entity's {@code @Version} stays the final guard against concurrent
 * writes.
 */
@org.springframework.stereotype.Service
public class ExecutionService {

    /** Feature 15: 25% of the proposal total are kept when a service is cancelled. */
    private static final BigDecimal RETENTION_RATE = new BigDecimal("0.25");

    /**
     * Feature 16: the statuses that occupy a service date. COMPLETED services
     * keep the history but free the date, and CANCELLED or soft-deleted ones
     * never block. The availability check below is the V1 business rule; it
     * does NOT replace the entity's {@code @Version}, which stays the final
     * guard against true concurrent writes at flush.
     */
    private static final Set<ExecutionStatus> DATE_OCCUPYING_STATUSES =
            Set.of(ExecutionStatus.PLANNED, ExecutionStatus.IN_PROGRESS);

    /** Strict state machine: allowed target statuses per current status. */
    private static final Map<ExecutionStatus, Set<ExecutionStatus>> TRANSITIONS;
    static {
        Map<ExecutionStatus, Set<ExecutionStatus>> map = new EnumMap<>(ExecutionStatus.class);
        map.put(ExecutionStatus.PLANNED, Set.of(ExecutionStatus.IN_PROGRESS, ExecutionStatus.CANCELLED));
        map.put(ExecutionStatus.IN_PROGRESS, Set.of(ExecutionStatus.COMPLETED, ExecutionStatus.CANCELLED));
        // Terminal states: no outgoing transitions.
        map.put(ExecutionStatus.COMPLETED, Set.of());
        map.put(ExecutionStatus.CANCELLED, Set.of());
        TRANSITIONS = Map.copyOf(map);
    }

    private final ExecutionRepository executions;
    private final PreparationRepository preparations;
    private final PaymentRepository payments;

    public ExecutionService(ExecutionRepository executions, PreparationRepository preparations,
            PaymentRepository payments) {
        this.executions = executions;
        this.preparations = preparations;
        this.payments = payments;
    }

    @Transactional
    public ExecutionResponse create(CreateExecutionRequest request) {
        Preparation preparation = preparations.findByIdAndDeletedAtIsNull(request.preparationId())
                .orElseThrow(() -> notFound("preparation not found"));
        Proposal proposal = preparation.getProposal();
        if (proposal.getStatus() != ProposalStatus.ACCEPTED) {
            throw conflict("execution requires an ACCEPTED proposal");
        }
        // Exactly Feature 08/09's depositReached derivation (sum of active payments).
        BigDecimal totalPaid = payments.sumActiveByProposalId(proposal.getId());
        if (totalPaid.compareTo(proposal.getRequiredDeposit()) < 0) {
            throw conflict("the required deposit has not been reached yet (paid "
                    + totalPaid + ", required " + proposal.getRequiredDeposit() + ")");
        }
        if (executions.existsByPreparationIdAndDeletedAtIsNull(preparation.getId())) {
            throw conflict("an execution already exists for this preparation");
        }
        // Feature 16: when a service date is provided at creation, it must be
        // free (PLANNED/IN_PROGRESS only). Without a date, Feature 10 behavior
        // is unchanged — a date is NOT required at creation.
        if (request.scheduledDate() != null) {
            assertDateFree(request.scheduledDate(), null);
        }
        Execution execution = new Execution();
        execution.setPreparation(preparation);
        execution.setScheduledDate(request.scheduledDate());
        try {
            return ExecutionResponse.from(executions.saveAndFlush(execution));
        } catch (DataIntegrityViolationException e) {
            // The partial unique index is the final guard against concurrent duplicates.
            throw conflict("an execution already exists for this preparation");
        }
    }

    @Transactional(readOnly = true)
    public ExecutionResponse get(UUID id) {
        return ExecutionResponse.from(findActive(id));
    }

    /** Listing with optional filters; soft-deleted executions are always excluded. */
    @Transactional(readOnly = true)
    public List<ExecutionResponse> list(UUID preparationId, ExecutionStatus status, LocalDate scheduledDate) {
        return executions.findMatching(preparationId, status, scheduledDate, scheduledDate != null).stream()
                .map(ExecutionResponse::from)
                .toList();
    }

    /**
     * Updates the operational info. scheduledDate is mandatory (validated on the
     * request) and the editable fields depend on the status: everything while
     * PLANNED (with endTime >= startTime when both are given), only location and
     * notes while IN_PROGRESS (rescheduling a started job is refused 409), none
     * once COMPLETED or CANCELLED (409).
     */
    @Transactional
    public ExecutionResponse update(UUID id, UpdateExecutionRequest request) {
        Execution execution = findActive(id);
        if (request.version() != execution.getVersion()) {
            throw conflict("execution was modified concurrently; reload with the current version and retry");
        }
        if (execution.getStatus() == ExecutionStatus.COMPLETED
                || execution.getStatus() == ExecutionStatus.CANCELLED) {
            throw conflict("a " + execution.getStatus() + " execution can no longer be modified");
        }
        if (execution.getStatus() == ExecutionStatus.IN_PROGRESS) {
            boolean scheduleChanged = !Objects.equals(request.scheduledDate(), execution.getScheduledDate())
                    || !Objects.equals(request.startTime(), execution.getStartTime())
                    || !Objects.equals(request.endTime(), execution.getEndTime());
            if (scheduleChanged) {
                throw conflict("an in-progress execution cannot be rescheduled; only location and notes can be corrected");
            }
            execution.setLocation(request.location());
            execution.setNotes(request.notes());
            return ExecutionResponse.from(executions.saveAndFlush(execution));
        }
        // PLANNED: the full operational info is editable.
        if (request.startTime() != null && request.endTime() != null
                && request.endTime().isBefore(request.startTime())) {
            throw badRequest("endTime cannot be before startTime");
        }
        execution.setScheduledDate(request.scheduledDate());
        execution.setStartTime(request.startTime());
        execution.setEndTime(request.endTime());
        execution.setLocation(request.location());
        execution.setNotes(request.notes());
        return ExecutionResponse.from(executions.saveAndFlush(execution));
    }

    /**
     * Strict status transition. Allowed: PLANNED -> IN_PROGRESS, PLANNED ->
     * CANCELLED, IN_PROGRESS -> COMPLETED, IN_PROGRESS -> CANCELLED; anything
     * else (including staying in the same status) is 409. The matching transition
     * timestamp is stamped by the server, never by the client.
     */
    @Transactional
    public ExecutionResponse changeStatus(UUID id, ExecutionStatus target) {
        Execution execution = findActive(id);
        if (!TRANSITIONS.get(execution.getStatus()).contains(target)) {
            throw conflict("cannot transition execution from " + execution.getStatus() + " to " + target);
        }
        execution.setStatus(target);
        switch (target) {
            case IN_PROGRESS -> execution.setStartedAt(OffsetDateTime.now());
            case COMPLETED -> execution.setCompletedAt(OffsetDateTime.now());
            case CANCELLED -> execution.setCancelledAt(OffsetDateTime.now());
            case PLANNED -> { /* no allowed transition targets PLANNED */ }
        }
        return ExecutionResponse.from(executions.saveAndFlush(execution));
    }

    /** Soft deletion: sets deletedAt; the row stays and the 1:1 slot is released. */
    @Transactional
    public void delete(UUID id) {
        findActive(id).markDeleted();
    }

    /**
     * Feature 15 — service date modification. Allowed only while PLANNED and
     * only up to J-5 included: the CURRENT service date minus 5 days must be
     * today or later (J-10, J-6 and J-5 are allowed; J-4, J-1 and the day
     * itself are refused 409). The new date is mandatory (validated on the
     * request) and only local dates are used, no extra business timezone. An
     * execution without a scheduled date yet has nothing to protect, so
     * setting its first date is always allowed. Optimistic locking follows
     * the update convention: a stale optional version is 409, and the
     * entity's {@code @Version} still rejects true concurrent writes at
     * flush. The theme is NOT handled here: no modifiable theme data exists
     * in the operational model (the demand-phase theme belongs to the demand,
     * not to the execution), so only the date is modifiable (Feature 15 §4).
     */
    @Transactional
    public ExecutionResponse reschedule(UUID id, UpdateScheduledDateRequest request) {
        Execution execution = findActive(id);
        checkOptionalVersion(execution, request.version());
        if (execution.getStatus() != ExecutionStatus.PLANNED) {
            throw conflict("a " + execution.getStatus() + " execution cannot be rescheduled");
        }
        LocalDate current = execution.getScheduledDate();
        if (current != null && current.minusDays(5).isBefore(LocalDate.now())) {
            throw conflict("the service date can only be modified up to 5 days before the service (J-5)");
        }
        // Feature 16: the new date must not be occupied by another ACTIVE
        // execution (PLANNED or IN_PROGRESS). This execution itself is excluded
        // from the search, so moving to its own current date never conflicts.
        // On conflict the exception aborts the transaction before any write and
        // the existing date stays unchanged.
        assertDateFree(request.scheduledDate(), id);
        execution.setScheduledDate(request.scheduledDate());
        return ExecutionResponse.from(executions.saveAndFlush(execution));
    }

    /**
     * Feature 15 — service cancellation. Allowed only while PLANNED (this
     * endpoint never cancels an IN_PROGRESS execution; the Feature 10 state
     * machine still offers IN_PROGRESS -> CANCELLED through PATCH /{id}/status).
     * {@code cancelledAt} is stamped by the server, the optional reason is
     * trimmed and stored, and the status becomes CANCELLED (terminal). The
     * amounts are derived, never stored: the retention is 25% of the ACCEPTED
     * proposal total (not of what was paid), HALF_UP at 2 decimals, and the
     * potential refund is what was already paid minus the retention, floored
     * at 0 — an indication only, never a payment movement, debt or credit.
     * Historical payments, receipts and invoices are never modified nor
     * deleted: a cancellation does not rewrite the documents already issued.
     */
    @Transactional
    public CancellationResponse cancel(UUID id, CancelExecutionRequest request) {
        Execution execution = findActive(id);
        checkOptionalVersion(execution, request.version());
        if (execution.getStatus() != ExecutionStatus.PLANNED) {
            throw conflict("only a PLANNED execution can be cancelled here; this one is "
                    + execution.getStatus());
        }
        execution.setStatus(ExecutionStatus.CANCELLED);
        execution.setCancelledAt(OffsetDateTime.now());
        execution.setCancellationReason(trimToNull(request.reason()));
        execution = executions.saveAndFlush(execution);

        Proposal proposal = execution.getPreparation().getProposal();
        BigDecimal proposalTotal = proposal.getTotalAmount().setScale(2, RoundingMode.HALF_UP);
        BigDecimal totalPaid = payments.sumActiveByProposalId(proposal.getId())
                .setScale(2, RoundingMode.HALF_UP);
        BigDecimal retainedAmount = proposalTotal.multiply(RETENTION_RATE)
                .setScale(2, RoundingMode.HALF_UP);
        BigDecimal potentialRefundAmount = totalPaid.subtract(retainedAmount);
        if (potentialRefundAmount.compareTo(BigDecimal.ZERO) < 0) {
            potentialRefundAmount = BigDecimal.ZERO.setScale(2);
        }
        return CancellationResponse.from(execution, proposalTotal, totalPaid, retainedAmount,
                potentialRefundAmount);
    }

    /**
     * Feature 16 — service availability. A date is occupied when an ACTIVE
     * execution (PLANNED or IN_PROGRESS, never soft-deleted) is scheduled on
     * it; COMPLETED services keep the history but free the date, and CANCELLED
     * or soft-deleted ones never block (cancelling releases the date
     * immediately). {@code excludeExecutionId} — used when moving an existing
     * service — must reference an existing, not soft-deleted execution (404
     * otherwise) and is ignored by the search so an execution never conflicts
     * with itself.
     *
     * <p>This application-level check is the V1 business rule ("is this date
     * already taken by another service?"); it is deliberately simple — one
     * active execution per local date, no slots, rooms, resources or time
     * overlaps — and it does NOT replace the entity's {@code @Version}: two
     * truly concurrent writes can still race between the check and the flush,
     * and the optimistic lock stays the final guard (409) against lost
     * updates. No locking architecture is introduced for this feature.
     */
    @Transactional(readOnly = true)
    public ExecutionAvailabilityResponse checkAvailability(LocalDate scheduledDate, UUID excludeExecutionId) {
        if (excludeExecutionId != null) {
            findActive(excludeExecutionId);
        }
        List<UUID> conflicting = executions
                .findActiveByScheduledDate(scheduledDate, DATE_OCCUPYING_STATUSES, excludeExecutionId)
                .stream()
                .map(Execution::getId)
                .toList();
        return new ExecutionAvailabilityResponse(scheduledDate, conflicting.isEmpty(), conflicting);
    }

    /** Feature 16 guard: 409 when another active execution already occupies the date. */
    private void assertDateFree(LocalDate scheduledDate, UUID excludedExecutionId) {
        if (!executions.findActiveByScheduledDate(scheduledDate, DATE_OCCUPYING_STATUSES, excludedExecutionId)
                .isEmpty()) {
            throw conflict("the service date " + scheduledDate
                    + " is already occupied by another active execution");
        }
    }

    /** Optional-version optimistic locking, the same convention as update(). */
    private void checkOptionalVersion(Execution execution, Long version) {
        if (version != null && version != execution.getVersion()) {
            throw conflict("execution was modified concurrently; reload with the current version and retry");
        }
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private Execution findActive(UUID id) {
        return executions.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> notFound("execution not found"));
    }

    private static ResponseStatusException notFound(String reason) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, reason);
    }

    private static ResponseStatusException conflict(String reason) {
        return new ResponseStatusException(HttpStatus.CONFLICT, reason);
    }

    private static ResponseStatusException badRequest(String reason) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, reason);
    }
}