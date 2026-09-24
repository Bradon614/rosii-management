package mg.rosii.management.execution;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

import mg.rosii.management.execution.dto.CreateExecutionRequest;
import mg.rosii.management.execution.dto.ExecutionResponse;
import mg.rosii.management.execution.dto.UpdateExecutionRequest;
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
 */
@org.springframework.stereotype.Service
public class ExecutionService {

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
        Execution execution = new Execution();
        execution.setPreparation(preparation);
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