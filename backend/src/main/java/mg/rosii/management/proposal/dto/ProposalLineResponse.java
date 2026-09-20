package mg.rosii.management.proposal.dto;

import java.math.BigDecimal;
import java.util.UUID;

import mg.rosii.management.proposal.ProposalLine;

/**
 * One proposal line in a response. {@code lineTotal} (quantity × unitPrice,
 * HALF_UP scale 2) is computed, never stored.
 */
public record ProposalLineResponse(
        UUID id,
        UUID serviceId,
        String description,
        String unit,
        BigDecimal quantity,
        BigDecimal unitPrice,
        BigDecimal lineTotal,
        String notes) {

    public static ProposalLineResponse from(ProposalLine line) {
        return new ProposalLineResponse(
                line.getId(),
                line.getService() == null ? null : line.getService().getId(),
                line.getDescription(),
                line.getUnit(),
                line.getQuantity(),
                line.getUnitPrice(),
                line.getLineTotal(),
                line.getNotes());
    }
}
