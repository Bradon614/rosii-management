package mg.rosii.management.dashboard.dto;

/**
 * One `status → count` pair of a dashboard distribution.
 *
 * <p>Every status of the underlying enum is always present, in the enum's
 * declaration order, including the ones whose count is zero: the dashboard
 * displays the full distribution, never only the statuses that happen to have
 * rows.
 *
 * @param <S> the status enum of the distribution
 */
public record StatusCountResponse<S extends Enum<S>>(S status, long count) {
}
