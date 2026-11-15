package mg.rosii.management.dashboard.dto;

import mg.rosii.management.demand.DemandType;

/**
 * One `demand type → count` pair of the dashboard distribution.
 *
 * <p>Only the types that actually have at least one demand appear, ordered by
 * decreasing count and, on equal counts, by the enum's declaration order. That
 * is exactly the ordering the dashboard has always displayed.
 */
public record TypeCountResponse(DemandType type, long count) {
}
