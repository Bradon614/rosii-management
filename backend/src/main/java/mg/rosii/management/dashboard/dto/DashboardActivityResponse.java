package mg.rosii.management.dashboard.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

import mg.rosii.management.closure.ClosureStatus;
import mg.rosii.management.dashboard.DashboardActivityKind;

/**
 * One real event of the recent-activity timeline.
 *
 * <p>This DTO carries data only. The wording and the navigation target stay in
 * the desktop application ({@code labels.ts} and the router), exactly as before:
 * the backend never decides how an event is labelled in French nor where it
 * links.
 *
 * <p>Only the fields that the event kind actually exposes are set; every other
 * one is {@code null}:
 * <ul>
 *   <li>{@code DEMAND_CREATED} → {@code clientName}</li>
 *   <li>{@code PROPOSAL_CREATED} / {@code PROPOSAL_ACCEPTED} → {@code proposalNumber}</li>
 *   <li>{@code PAYMENT_RECORDED} → {@code proposalNumber} and {@code amount}</li>
 *   <li>{@code EXECUTION_COMPLETED} → {@code scheduledDate}, which may be
 *       {@code null} when the execution has no planned date</li>
 *   <li>{@code CLOSURE_CLOSED} → {@code closureStatus}</li>
 * </ul>
 *
 * @param kind          which real event this is
 * @param id            identifier of the underlying row, also used for the link
 * @param date          the real instant of the event (never null: rows without a
 *                      date are never selected)
 * @param clientName    client name, for a created demand
 * @param proposalNumber proposal number, for a proposal or payment event
 * @param amount        recorded amount, for a payment event
 * @param scheduledDate planned service date, for a completed execution
 * @param closureStatus closure result, for a closed service
 */
public record DashboardActivityResponse(
        DashboardActivityKind kind,
        UUID id,
        OffsetDateTime date,
        String clientName,
        String proposalNumber,
        BigDecimal amount,
        LocalDate scheduledDate,
        ClosureStatus closureStatus) {
}
