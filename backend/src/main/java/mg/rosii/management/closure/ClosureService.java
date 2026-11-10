package mg.rosii.management.closure;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;

import mg.rosii.management.closure.dto.ClosureResponse;
import mg.rosii.management.closure.dto.CreateClosureRequest;
import mg.rosii.management.closure.dto.UpdateClosureRequest;
import mg.rosii.management.execution.Execution;
import mg.rosii.management.execution.ExecutionRepository;
import mg.rosii.management.execution.ExecutionStatus;
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
 * Closure business logic (Feature 11): the official end of a service after its
 * execution has COMPLETED.
 *
 * <p>Creation re-checks every upstream gate instead of trusting history: the
 * preparation exists and is active (404), the proposal behind it is still
 * ACCEPTED (409), the required deposit is reached (409 — the exact same derived
 * {@code depositReached} check as Features 08/09/10: sum of the active payments,
 * never stored), the execution of the preparation exists (404) and is COMPLETED
 * (409), and no active closure exists yet (409, one per preparation via the
 * partial unique index of V10).
 *
 * <p>An active closure is definitive: every PUT answers 409 (after the usual
 * stale-version 409), {@code closedAt} is stamped once by the server and never
 * changes, and only soft delete is allowed (which releases the slot so a new
 * closure may later be created while the rules still hold).
 */
@org.springframework.stereotype.Service
public class ClosureService {

    private final ServiceClosureRepository closures;
    private final PreparationRepository preparations;
    private final PaymentRepository payments;
    private final ExecutionRepository executions;

    public ClosureService(ServiceClosureRepository closures, PreparationRepository preparations,
            PaymentRepository payments, ExecutionRepository executions) {
        this.closures = closures;
        this.preparations = preparations;
        this.payments = payments;
        this.executions = executions;
    }

    @Transactional
    public ClosureResponse create(CreateClosureRequest request) {
        // 1. The preparation must exist and be active (404).
        Preparation preparation = preparations.findByIdAndDeletedAtIsNull(request.preparationId())
                .orElseThrow(() -> notFound("preparation not found"));
        // 2. The proposal behind the preparation must still be ACCEPTED (409).
        Proposal proposal = preparation.getProposal();
        if (proposal.getStatus() != ProposalStatus.ACCEPTED) {
            throw conflict("closure requires an ACCEPTED proposal");
        }
        // 3. Exactly Feature 08's depositReached derivation (sum of active payments).
        BigDecimal totalPaid = payments.sumActiveByProposalId(proposal.getId());
        if (totalPaid.compareTo(proposal.getRequiredDeposit()) < 0) {
            throw conflict("the required deposit has not been reached yet (paid "
                    + totalPaid + ", required " + proposal.getRequiredDeposit() + ")");
        }
        // 4. The execution of the preparation must exist (404)... The 1:1 rule of
        // Feature 10 guarantees at most one active execution; the repository-wide
        // list query reuses it without touching the Feature 10 code.
        Execution execution = executions.findMatching(preparation.getId(), null, null, false)
                .stream().findFirst()
                .orElseThrow(() -> notFound("execution not found"));
        // 5. ...and be COMPLETED (409): a closure closes a finished service only.
        if (execution.getStatus() != ExecutionStatus.COMPLETED) {
            throw conflict("closure requires a COMPLETED execution");
        }
        // 6. One active closure per preparation (409).
        if (closures.existsByPreparationIdAndDeletedAtIsNull(preparation.getId())) {
            throw conflict("a closure already exists for this preparation");
        }
        ServiceClosure closure = new ServiceClosure();
        closure.setPreparation(preparation);
        // status defaults to COMPLETED when omitted; no other status exists.
        closure.setStatus(request.status() != null ? request.status() : ClosureStatus.COMPLETED);
        // Stamped by the server, never accepted from the client.
        closure.setClosedAt(OffsetDateTime.now());
        closure.setFinalNotes(request.finalNotes());
        try {
            // Feature 34: the execution was already loaded and checked above, so
            // the response context costs no extra query here.
            return ClosureResponse.from(closures.saveAndFlush(closure), execution);
        } catch (DataIntegrityViolationException e) {
            // The partial unique index is the final guard against concurrent duplicates.
            throw conflict("a closure already exists for this preparation");
        }
    }

    /**
     * Single closure read. The preparation and its proposal come with the row
     * (repository entity graph); the active execution of the preparation is one
     * extra statement, which stays constant because the read is single-row.
     */
    @Transactional(readOnly = true)
    public ClosureResponse get(UUID id) {
        ServiceClosure closure = findActive(id);
        return ClosureResponse.from(closure, activeExecutionOf(closure));
    }

    /**
     * Optional combined filters: preparationId and/or status; soft-deleted never appear.
     *
     * <p>Feature 34 — the row context (proposal number and active execution) is
     * resolved WITHOUT one read per row: the closures and their proposals come
     * from a single joined query, then the active executions of every listed
     * preparation are loaded by ONE batched {@code in :ids} query and matched in
     * memory. The number of statements is therefore constant (two) whatever the
     * list size.
     */
    @Transactional(readOnly = true)
    public List<ClosureResponse> list(UUID preparationId, ClosureStatus status) {
        List<ServiceClosure> found = closures.findMatching(preparationId, status);
        if (found.isEmpty()) {
            return List.of();
        }
        List<UUID> preparationIds = found.stream()
                .map(closure -> closure.getPreparation().getId())
                .toList();
        // The 1:1 rule of Feature 10 allows at most one ACTIVE execution per
        // preparation (partial unique index in V9), so this map has one entry per
        // preparation and no collision is possible.
        Map<UUID, Execution> activeByPreparation = executions
                .findByPreparationIdInAndDeletedAtIsNull(preparationIds).stream()
                .collect(Collectors.toMap(execution -> execution.getPreparation().getId(),
                        execution -> execution));
        return found.stream()
                .map(closure -> ClosureResponse.from(closure,
                        activeByPreparation.get(closure.getPreparation().getId())))
                .toList();
    }

    /** The active execution of a closure's preparation, or null when none exists. */
    private Execution activeExecutionOf(ServiceClosure closure) {
        return executions.findByPreparationIdAndDeletedAtIsNull(closure.getPreparation().getId())
                .orElse(null);
    }

    /**
     * An active closure is definitive: after the usual version contract (stale
     * version 409, like every other update of the project), every modification
     * attempt answers 409 — nothing is ever written, so {@code closedAt},
     * {@code status} and {@code finalNotes} all stay untouched. A soft-deleted
     * closure is 404 (it no longer exists as far as the API is concerned).
     */
    @Transactional
    public ClosureResponse update(UUID id, UpdateClosureRequest request) {
        ServiceClosure closure = findActive(id);
        if (!Objects.equals(request.version(), closure.getVersion())) {
            throw conflict("service closure was modified concurrently; reload and retry");
        }
        throw conflict("a service closure is definitive and can no longer be modified");
    }

    /** Soft deletion: sets deletedAt; the row is kept and the 1:1 slot is released. */
    @Transactional
    public void delete(UUID id) {
        findActive(id).markDeleted();
    }

    private ServiceClosure findActive(UUID id) {
        return closures.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> notFound("service closure not found"));
    }

    private static ResponseStatusException notFound(String reason) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, reason);
    }

    private static ResponseStatusException conflict(String reason) {
        return new ResponseStatusException(HttpStatus.CONFLICT, reason);
    }
}