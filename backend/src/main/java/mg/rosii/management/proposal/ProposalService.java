package mg.rosii.management.proposal;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.EnumMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import mg.rosii.management.client.Client;
import mg.rosii.management.client.ClientRepository;
import mg.rosii.management.demand.Demand;
import mg.rosii.management.demand.DemandRepository;
import mg.rosii.management.payment.PaymentRepository;
import mg.rosii.management.proposal.dto.CreateProposalRequest;
import mg.rosii.management.proposal.dto.ProposalLineRequest;
import mg.rosii.management.proposal.dto.ProposalResponse;
import mg.rosii.management.proposal.dto.UpdateProposalRequest;
import mg.rosii.management.service.Service;
import mg.rosii.management.service.ServiceRepository;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Proposal/quote business logic (Feature 07): "what did we propose, and what
 * did the client answer?" — no project, reservation or payment behavior.
 *
 * <p>Statuses follow a strict state machine (Decision B); transitions go
 * through {@code changeStatus} only. Content is editable only while DRAFT.
 * Line values are snapshots taken from the catalogue while editing; after SENT
 * nothing is re-read from the catalogue. Totals are derived, never stored.
 */
@org.springframework.stereotype.Service
public class ProposalService {

    /** Strict state machine (Decision B): allowed target statuses per current status. */
    private static final Map<ProposalStatus, Set<ProposalStatus>> TRANSITIONS;
    static {
        Map<ProposalStatus, Set<ProposalStatus>> map = new EnumMap<>(ProposalStatus.class);
        map.put(ProposalStatus.DRAFT, Set.of(ProposalStatus.SENT, ProposalStatus.CANCELLED));
        map.put(ProposalStatus.SENT, Set.of(ProposalStatus.ACCEPTED, ProposalStatus.REFUSED,
                ProposalStatus.CANCELLED, ProposalStatus.DRAFT, ProposalStatus.EXPIRED));
        // Terminal states: no outgoing transitions.
        map.put(ProposalStatus.ACCEPTED, Set.of());
        map.put(ProposalStatus.REFUSED, Set.of());
        map.put(ProposalStatus.EXPIRED, Set.of());
        map.put(ProposalStatus.CANCELLED, Set.of());
        TRANSITIONS = Map.copyOf(map);
    }

    private final ProposalRepository proposals;
    private final ClientRepository clients;
    private final DemandRepository demands;
    private final ServiceRepository services;
    private final PaymentRepository payments;

    public ProposalService(ProposalRepository proposals, ClientRepository clients,
            DemandRepository demands, ServiceRepository services, PaymentRepository payments) {
        this.proposals = proposals;
        this.clients = clients;
        this.demands = demands;
        this.services = services;
        this.payments = payments;
    }

    @Transactional
    public ProposalResponse create(CreateProposalRequest request) {
        Client client = findActiveClient(request.clientId());
        Demand demand = findActiveDemandFor(request.demandId(), client);
        if (request.validUntil() != null && request.validUntil().isBefore(LocalDate.now())) {
            throw badRequest("validUntil cannot be before the proposal creation date");
        }
        Proposal proposal = new Proposal();
        proposal.setClient(client);
        proposal.setDemand(demand);
        proposal.setStatus(ProposalStatus.DRAFT);
        proposal.setTitle(trimToNull(request.title()));
        proposal.setValidUntil(request.validUntil());
        proposal.setNotes(trimToNull(request.notes()));
        proposal.replaceLines(buildLines(request.lines()));
        proposal.setNumber(nextNumber());
        applyDeposit(proposal, request.requiredDeposit());
        try {
            return ProposalResponse.from(proposals.saveAndFlush(proposal),
                    payments.sumActiveByProposalId(proposal.getId()));
        } catch (DataIntegrityViolationException e) {
            // The unique number constraint is the final guard against duplicates.
            throw new ResponseStatusException(HttpStatus.CONFLICT, "proposal number already exists");
        }
    }

    @Transactional(readOnly = true)
    public ProposalResponse get(UUID id) {
        Proposal proposal = findActive(id);
        expireIfPastValidity(proposal);
        return toResponse(proposal);
    }

    /**
     * Lists non-deleted proposals (newest first) with optional combined filters.
     *
     * <p>A {@code status=SENT} filter also excludes proposals past their
     * {@code validUntil}: they are lazily considered EXPIRED, so they are never
     * reported as SENT.
     */
    @Transactional(readOnly = true)
    public List<ProposalResponse> list(String search, UUID clientId, UUID demandId, ProposalStatus status) {
        String pattern = search == null || search.isBlank() ? null : likePattern(search.trim());
        List<Proposal> found = proposals.findMatching(pattern, clientId, demandId, status,
                ProposalStatus.SENT, LocalDate.now());
        found.forEach(this::expireIfPastValidity);
        Map<UUID, BigDecimal> paid = paidTotals(found);
        return found.stream()
                .map(proposal -> ProposalResponse.from(proposal,
                        paid.getOrDefault(proposal.getId(), BigDecimal.ZERO)))
                .toList();
    }

    @Transactional
    public ProposalResponse update(UUID id, UpdateProposalRequest request) {
        Proposal proposal = findActive(id);
        checkVersion(proposal, request.version());
        if (proposal.getStatus() != ProposalStatus.DRAFT) {
            throw conflict("only a DRAFT proposal can be edited");
        }
        Client client = findActiveClient(request.clientId());
        Demand demand = findActiveDemandFor(request.demandId(), client);
        if (request.validUntil() != null
                && request.validUntil().isBefore(proposal.getCreatedAt().toLocalDate())) {
            throw badRequest("validUntil cannot be before the proposal creation date");
        }
        proposal.setClient(client);
        proposal.setDemand(demand);
        proposal.setTitle(trimToNull(request.title()));
        proposal.setValidUntil(request.validUntil());
        proposal.setNotes(trimToNull(request.notes()));
        proposal.replaceLines(buildLines(request.lines()));
        applyDeposit(proposal, request.requiredDeposit());
        // Flush so the response carries the incremented @Version, not the stale one.
        return ProposalResponse.from(proposals.saveAndFlush(proposal),
                payments.sumActiveByProposalId(proposal.getId()));
    }

    /**
     * Changes the requested deposit only (deposit stays editable independently of
     * the frozen commercial content, until a future preparation feature locks it).
     */
    @Transactional
    public ProposalResponse updateDeposit(UUID id, BigDecimal requiredDeposit, long expectedVersion) {
        Proposal proposal = findActive(id);
        checkVersion(proposal, expectedVersion);
        applyDeposit(proposal, requiredDeposit);
        return ProposalResponse.from(proposals.saveAndFlush(proposal),
                payments.sumActiveByProposalId(proposal.getId()));
    }

    @Transactional
    public ProposalResponse changeStatus(UUID id, ProposalStatus target, long expectedVersion) {
        Proposal proposal = findActive(id);
        checkVersion(proposal, expectedVersion);
        expireIfPastValidity(proposal);
        ProposalStatus current = proposal.getStatus();
        if (!TRANSITIONS.get(current).contains(target)) {
            throw conflict("cannot transition proposal from " + current + " to " + target);
        }
        if (target == ProposalStatus.SENT) {
            validateSendable(proposal);
            proposal.setSentAt(OffsetDateTime.now());
        } else if (target == ProposalStatus.ACCEPTED) {
            proposal.setAcceptedAt(OffsetDateTime.now());
        } else if (target == ProposalStatus.REFUSED) {
            proposal.setRefusedAt(OffsetDateTime.now());
        } else if (target == ProposalStatus.CANCELLED) {
            proposal.setCancelledAt(OffsetDateTime.now());
        }
        // SENT -> DRAFT preserves historical timestamps per project conventions.
        proposal.setStatus(target);
        return ProposalResponse.from(proposals.saveAndFlush(proposal),
                payments.sumActiveByProposalId(proposal.getId()));
    }

    /** Soft deletion: sets deletedAt; the row remains in PostgreSQL. */
    @Transactional
    public void delete(UUID id) {
        findActive(id).markDeleted();
    }

    private Proposal findActive(UUID id) {
        return proposals.findByIdAndDeletedAtIsNull(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "proposal not found"));
    }

    /** Unknown or soft-deleted clients answer 404: no enumeration of client state. */
    private Client findActiveClient(UUID clientId) {
        return clients.findByIdAndDeletedAtIsNull(clientId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "client not found"));
    }

    private Demand findActiveDemand(UUID demandId) {
        return demands.findByIdAndDeletedAtIsNull(demandId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "demand not found"));
    }

    /** Decision A: the demand is mandatory and must belong to the proposal's client. */
    private Demand findActiveDemandFor(UUID demandId, Client client) {
        Demand demand = findActiveDemand(demandId);
        if (!demand.getClient().getId().equals(client.getId())) {
            throw badRequest("demand does not belong to the proposal's client");
        }
        return demand;
    }

    /** Unknown or soft-deleted services answer 404; the reference stays optional. */
    private Service findActiveService(UUID serviceId) {
        return services.findByIdAndDeletedAtIsNull(serviceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "service not found"));
    }

    private void checkVersion(Proposal proposal, long expectedVersion) {
        if (expectedVersion != proposal.getVersion()) {
            throw conflict("proposal was modified concurrently; reload with the current version and retry");
        }
    }

    /**
     * Validates and applies the requested deposit: mandatory, > 0 and never above
     * the proposal total (sum of its lines).
     */
    private static void applyDeposit(Proposal proposal, BigDecimal requiredDeposit) {
        if (requiredDeposit == null || requiredDeposit.signum() <= 0) {
            throw badRequest("requiredDeposit must be greater than zero");
        }
        BigDecimal total = proposal.getTotalAmount();
        if (requiredDeposit.compareTo(total) > 0) {
            throw badRequest("requiredDeposit cannot exceed the proposal total (" + total + ")");
        }
        proposal.changeRequiredDeposit(requiredDeposit);
    }

    /** Response with the derived financial values of a single proposal. */
    private ProposalResponse toResponse(Proposal proposal) {
        return ProposalResponse.from(proposal, payments.sumActiveByProposalId(proposal.getId()));
    }

    /** Paid totals for a batch of proposals, keyed by proposal id (one query). */
    private Map<UUID, BigDecimal> paidTotals(List<Proposal> found) {
        if (found.isEmpty()) {
            return Map.of();
        }
        List<UUID> ids = found.stream().map(Proposal::getId).toList();
        Map<UUID, BigDecimal> totals = new java.util.HashMap<>();
        for (Object[] row : payments.sumActiveByProposalIds(ids)) {
            totals.put((UUID) row[0], (BigDecimal) row[1]);
        }
        return totals;
    }

    /**
     * Builds line entities from the request. Provided snapshot values
     * (description/unit/unitPrice) always win; a referenced service only
     * supplies the link. Catalogue values are never re-read after SENT.
     */
    private List<ProposalLine> buildLines(List<ProposalLineRequest> requests) {
        return requests.stream().map(request -> {
            ProposalLine line = new ProposalLine();
            if (request.serviceId() != null) {
                line.setService(findActiveService(request.serviceId()));
            }
            line.setDescription(trimToNull(request.description()));
            line.setUnit(trimToNull(request.unit()));
            line.setQuantity(request.quantity());
            line.setUnitPrice(request.unitPrice());
            line.setNotes(trimToNull(request.notes()));
            return line;
        }).toList();
    }

    /** Decision E + section 10: a proposal can only be sent with lines and a valid validUntil. */
    private void validateSendable(Proposal proposal) {
        if (proposal.getLines().isEmpty()) {
            throw badRequest("a proposal must contain at least one line to be sent");
        }
        if (proposal.getValidUntil() == null) {
            throw badRequest("validUntil is required to send a proposal");
        }
        if (proposal.getValidUntil().isBefore(proposal.getCreatedAt().toLocalDate())) {
            throw badRequest("validUntil cannot be before the proposal creation date");
        }
    }

    /**
     * Lazy expiration (no scheduler): a SENT proposal past its validUntil is
     * treated as EXPIRED at read/transition time.
     */
    private void expireIfPastValidity(Proposal proposal) {
        if (proposal.getStatus() == ProposalStatus.SENT
                && proposal.getValidUntil() != null
                && proposal.getValidUntil().isBefore(LocalDate.now())) {
            proposal.setStatus(ProposalStatus.EXPIRED);
        }
    }

    /** Decision C: PROP-YYYY-NNNN, per-year sequence; unique constraint is the final guard. */
    private String nextNumber() {
        int year = LocalDate.now().getYear();
        String prefix = "PROP-" + year + "-";
        int max = proposals.findNumbersByPrefix(prefix).stream()
                .map(number -> number.substring(prefix.length()))
                .filter(suffix -> suffix.matches("\\d+"))
                .mapToInt(Integer::parseInt)
                .max()
                .orElse(0);
        return prefix + String.format("%04d", max + 1);
    }

    private static ResponseStatusException badRequest(String reason) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, reason);
    }

    private static ResponseStatusException conflict(String reason) {
        return new ResponseStatusException(HttpStatus.CONFLICT, reason);
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String likePattern(String term) {
        String escaped = term.toLowerCase(Locale.ROOT)
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
        return "%" + escaped + "%";
    }
}

