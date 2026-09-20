package mg.rosii.management.proposal;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import jakarta.validation.Valid;

import mg.rosii.management.proposal.dto.CreateProposalRequest;
import mg.rosii.management.proposal.dto.ProposalResponse;
import mg.rosii.management.proposal.dto.SetProposalStatusRequest;
import mg.rosii.management.proposal.dto.UpdateProposalRequest;

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
 * Proposal API. Requires authentication via the existing security config (no
 * permitAll additions); V1 single-role PATRONNE.
 */
@RestController
@RequestMapping("/api/proposals")
public class ProposalController {

    private final ProposalService proposalService;

    public ProposalController(ProposalService proposalService) {
        this.proposalService = proposalService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ProposalResponse create(@Valid @RequestBody CreateProposalRequest request) {
        return proposalService.create(request);
    }

    @GetMapping
    public List<ProposalResponse> list(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) UUID clientId,
            @RequestParam(required = false) UUID demandId,
            @RequestParam(required = false) ProposalStatus status) {
        return proposalService.list(search, clientId, demandId, status);
    }

    @GetMapping("/{id}")
    public ProposalResponse get(@PathVariable UUID id) {
        return proposalService.get(id);
    }

    @PutMapping("/{id}")
    public ProposalResponse update(@PathVariable UUID id, @Valid @RequestBody UpdateProposalRequest request) {
        return proposalService.update(id, request);
    }

    /** Status transitions go through the strict state machine only. */
    @PatchMapping("/{id}/status")
    public ProposalResponse setStatus(@PathVariable UUID id, @Valid @RequestBody SetProposalStatusRequest request) {
        return proposalService.changeStatus(id, request.status(), request.version());
    }

    /** Soft delete: the proposal disappears from the API but the row is kept. */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        proposalService.delete(id);
    }

    /** True concurrent update caught by @Version at flush — clean 409. */
    @ExceptionHandler(OptimisticLockingFailureException.class)
    public ResponseEntity<Map<String, String>> handleConcurrentModification(
            OptimisticLockingFailureException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", "proposal was modified concurrently; reload and retry"));
    }
}
