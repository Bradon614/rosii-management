package mg.rosii.management.preparation;

import java.math.BigDecimal;
import java.util.UUID;

import mg.rosii.management.closure.ServiceClosureRepository;
import mg.rosii.management.execution.ExecutionRepository;
import mg.rosii.management.payment.PaymentRepository;
import mg.rosii.management.preparation.dto.CreatePreparationRequest;
import mg.rosii.management.preparation.dto.PreparationResponse;
import mg.rosii.management.proposal.Proposal;
import mg.rosii.management.proposal.ProposalRepository;
import mg.rosii.management.proposal.ProposalStatus;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Preparation business logic (Feature 09): the first operational layer of the
 * workflow {@code ACCEPTED → deposit reached → PREPARATION → (EXECUTION, future)}.
 *
 * <p>A preparation can only be created for an existing, ACCEPTED proposal whose
 * required deposit is reached — the same derivation as Feature 08's
 * {@code depositReached} (sum of the active payments vs requiredDeposit, never
 * stored). Nothing else: no task, assignment, planning or execution behavior
 * exists in the business rules.
 */
@org.springframework.stereotype.Service
public class PreparationService {

    private final PreparationRepository preparations;
    private final ProposalRepository proposals;
    private final PaymentRepository payments;
    private final ExecutionRepository executions;
    private final ServiceClosureRepository closures;

    public PreparationService(PreparationRepository preparations, ProposalRepository proposals,
            PaymentRepository payments, ExecutionRepository executions,
            ServiceClosureRepository closures) {
        this.preparations = preparations;
        this.proposals = proposals;
        this.payments = payments;
        this.executions = executions;
        this.closures = closures;
    }

    @Transactional
    public PreparationResponse create(CreatePreparationRequest request) {
        // Lock the proposal first: the deposit update takes the same row lock, so
        // a preparation cannot be inserted concurrently while a direct API call is
        // changing the deposit. This also makes the eligibility checks (status,
        // deposit) and the insert follow one consistent proposal state.
        Proposal proposal = proposals.findActiveForUpdate(request.proposalId())
                .orElseThrow(() -> notFound("proposal not found"));
        if (proposal.getStatus() != ProposalStatus.ACCEPTED) {
            throw conflict("preparation requires an ACCEPTED proposal");
        }
        // Exactly Feature 08's depositReached derivation (sum of active payments).
        BigDecimal totalPaid = payments.sumActiveByProposalId(proposal.getId());
        if (totalPaid.compareTo(proposal.getRequiredDeposit()) < 0) {
            throw conflict("the required deposit has not been reached yet (paid "
                    + totalPaid + ", required " + proposal.getRequiredDeposit() + ")");
        }
        if (preparations.findByProposalIdAndDeletedAtIsNull(proposal.getId()).isPresent()) {
            throw conflict("a preparation already exists for this proposal");
        }
        Preparation preparation = new Preparation();
        preparation.setProposal(proposal);
        try {
            return PreparationResponse.from(preparations.saveAndFlush(preparation));
        } catch (DataIntegrityViolationException e) {
            // The partial unique index is the final guard against concurrent duplicates.
            throw conflict("a preparation already exists for this proposal");
        }
    }

    @Transactional(readOnly = true)
    public PreparationResponse get(UUID id) {
        return PreparationResponse.from(findActive(id));
    }

    /** The preparation linked to a proposal (404 for either unknown). */
    @Transactional(readOnly = true)
    public PreparationResponse getByProposal(UUID proposalId) {
        if (proposals.findByIdAndDeletedAtIsNull(proposalId).isEmpty()) {
            throw notFound("proposal not found");
        }
        return PreparationResponse.from(preparations.findByProposalIdAndDeletedAtIsNull(proposalId)
                .orElseThrow(() -> notFound("preparation not found")));
    }

    /**
     * Soft deletion: sets deletedAt; the slot for the proposal is released.
     *
     * <p>Feature 30 — integrity guard: deletion is refused with 409 while an
     * <em>active</em> execution or closure still depends on this preparation.
     * Soft-deleted dependencies never block (the existence queries are filtered
     * by {@code deletedAt is null}), so a preparation whose operational chain
     * was itself soft-deleted can be deleted again. Nothing is cascaded: the
     * execution and closure rows are never modified.
     *
     * <p>Concurrency: the check and the soft delete run in one transaction. A
     * concurrent execution/closure creation can still commit between the check
     * and this transaction's commit; closing that window would require the
     * creation side (Features 10/11) to lock or re-check the preparation, which
     * is outside this feature's scope. No extra row lock is taken — it would not
     * serialize against the current lock-free creation paths.
     */
    @Transactional
    public void delete(UUID id) {
        Preparation preparation = findActive(id);
        // Existence checks only: no entity is loaded and the first refusal
        // short-circuits the second query.
        if (executions.existsByPreparationIdAndDeletedAtIsNull(id)) {
            throw conflict("preparation cannot be deleted: an active execution depends on it");
        }
        if (closures.existsByPreparationIdAndDeletedAtIsNull(id)) {
            throw conflict("preparation cannot be deleted: an active closure depends on it");
        }
        preparation.markDeleted();
    }

    private Preparation findActive(UUID id) {
        return preparations.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> notFound("preparation not found"));
    }

    private static ResponseStatusException notFound(String reason) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, reason);
    }

    private static ResponseStatusException conflict(String reason) {
        return new ResponseStatusException(HttpStatus.CONFLICT, reason);
    }
}
