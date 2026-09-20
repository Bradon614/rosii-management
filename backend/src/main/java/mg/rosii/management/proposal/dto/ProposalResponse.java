package mg.rosii.management.proposal.dto;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import mg.rosii.management.proposal.Proposal;
import mg.rosii.management.proposal.ProposalStatus;

/**
 * Proposal representation. {@code totalAmount} (sum of line totals) is computed,
 * never stored. {@code version} is exposed so clients can supply it on
 * update/status change.
 */
public record ProposalResponse(
        UUID id,
        String number,
        UUID clientId,
        UUID demandId,
        ProposalStatus status,
        String title,
        OffsetDateTime sentAt,
        OffsetDateTime acceptedAt,
        OffsetDateTime refusedAt,
        OffsetDateTime cancelledAt,
        LocalDate validUntil,
        String notes,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        long version,
        List<ProposalLineResponse> lines,
        BigDecimal totalAmount) {

    public static ProposalResponse from(Proposal proposal) {
        var lines = proposal.getLines().stream().map(ProposalLineResponse::from).toList();
        BigDecimal total = proposal.getLines().stream()
                .map(line -> line.getLineTotal())
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);
        return new ProposalResponse(
                proposal.getId(),
                proposal.getNumber(),
                proposal.getClient().getId(),
                proposal.getDemand().getId(),
                proposal.getStatus(),
                proposal.getTitle(),
                proposal.getSentAt(),
                proposal.getAcceptedAt(),
                proposal.getRefusedAt(),
                proposal.getCancelledAt(),
                proposal.getValidUntil(),
                proposal.getNotes(),
                proposal.getCreatedAt(),
                proposal.getUpdatedAt(),
                proposal.getVersion(),
                lines,
                total);
    }
}
