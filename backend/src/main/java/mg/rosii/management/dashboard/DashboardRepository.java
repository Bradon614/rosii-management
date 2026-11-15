package mg.rosii.management.dashboard;

import java.util.List;
import java.util.UUID;

import mg.rosii.management.demand.Demand;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * Read model of the dashboard (Feature 35).
 *
 * <p>These are single-pass aggregates: each method returns every figure of one
 * domain in one statement, so the cost of the dashboard never grows with the
 * number of rows. Every query filters soft-deleted rows explicitly (no global
 * Hibernate filter, per {@code docs/database-conventions.md}).
 *
 * <p>The interface extends {@link Repository} — the bare Spring Data marker — so
 * no CRUD method is exposed: only the queries declared here are implemented.
 * {@code Demand} is used as the anchor type only because a Spring Data
 * repository needs one; these queries deliberately span several tables, which is
 * also why the recent-activity timeline is a native {@code UNION ALL} (JPQL has
 * no union).
 */
public interface DashboardRepository extends Repository<Demand, UUID> {

    /**
     * Active demands grouped by status and type: one statement covers the total,
     * the status distribution and the type distribution.
     *
     * @return rows of {@code [DemandStatus, DemandType, Long]}
     */
    @Query("""
            select d.status, d.type, count(d)
            from Demand d
            where d.deletedAt is null
            group by d.status, d.type
            """)
    List<Object[]> countDemandsByStatusAndType();

    /**
     * Active proposals grouped by stored status <em>and</em> validity date.
     *
     * <p>The validity date is part of the grouping on purpose: it is what lets
     * the caller apply the real expiration rule
     * ({@link mg.rosii.management.proposal.ProposalExpiration}) to the stored
     * values instead of duplicating it in SQL.
     *
     * @return rows of {@code [ProposalStatus, LocalDate, Long]}
     */
    @Query("""
            select p.status, p.validUntil, count(p)
            from Proposal p
            where p.deletedAt is null
            group by p.status, p.validUntil
            """)
    List<Object[]> countProposalsByStatusAndValidity();

    /**
     * Active payment count and summed amount in one statement.
     *
     * @return a single row of {@code [Long, BigDecimal]}
     */
    @Query("""
            select count(p), coalesce(sum(p.amount), 0)
            from Payment p
            where p.deletedAt is null
            """)
    List<Object[]> paymentAggregate();

    /**
     * Active executions grouped by status.
     *
     * @return rows of {@code [ExecutionStatus, Long]}
     */
    @Query("""
            select e.status, count(e)
            from Execution e
            where e.deletedAt is null
            group by e.status
            """)
    List<Object[]> countExecutionsByStatus();

    /**
     * Active closures grouped by status.
     *
     * @return rows of {@code [ClosureStatus, Long]}
     */
    @Query("""
            select c.status, count(c)
            from ServiceClosure c
            where c.deletedAt is null
            group by c.status
            """)
    List<Object[]> countClosuresByStatus();

    /**
     * The most recent real events of the six kinds the dashboard displays, in
     * one {@code UNION ALL} statement, bounded to {@code limit} rows.
     *
     * <p>Rows without a real date are never selected, and soft-deleted rows of
     * every source table are excluded. Two joins are deliberately <em>not</em>
     * filtered on the joined row's own {@code deleted_at}: the event carries the
     * client name of a demand and the proposal number of a payment, exactly as
     * the demand and payment endpoints already report them (the underlying
     * <em>event</em> is the active demand or payment, not the joined reference).
     *
     * <p>The ordering reproduces the timeline the desktop application has always
     * built. The dashboard sorts by date descending, then by the event's
     * <em>composed</em> identifier — {@code "<kind>-<uuid>"}, the very string the
     * frontend uses as its React key and as its tie-breaker — ascending. The
     * {@code kind_slug} column exists only for that comparison: it is never
     * returned. The {@code C} collation makes the comparison a byte comparison,
     * which is what a UUID's textual form needs (digits before letters, hyphen
     * before both) and what the frontend's string comparison produces.
     *
     * <p>The composed identifier is unique per event, so this ordering is total:
     * unlike a tie-break on the bare UUID, it also separates a proposal created
     * and accepted at the very same instant ({@code proposal-accepted-…} sorts
     * before {@code proposal-created-…}).
     *
     * @param limit maximum number of events to return
     * @return rows of {@code [String kind, UUID id, OffsetDateTime date,
     *         String clientName, String proposalNumber, BigDecimal amount,
     *         LocalDate scheduledDate, String closureStatus]}
     */
    @Query(value = """
            select ev.kind, ev.id, ev.evt, ev.client_name, ev.proposal_number,
                   ev.amount, ev.scheduled_date, ev.closure_status
            from (
                select 'DEMAND_CREATED' as kind, 'demand-created' as kind_slug,
                       d.id as id, d.created_at as evt,
                       c.name as client_name, cast(null as varchar) as proposal_number,
                       cast(null as numeric) as amount, cast(null as date) as scheduled_date,
                       cast(null as varchar) as closure_status
                from demands d
                join clients c on c.id = d.client_id
                where d.deleted_at is null
                union all
                select 'PROPOSAL_CREATED', 'proposal-created', p.id, p.created_at, null, p.number, null, null, null
                from proposals p
                where p.deleted_at is null
                union all
                select 'PROPOSAL_ACCEPTED', 'proposal-accepted', p.id, p.accepted_at, null, p.number, null, null, null
                from proposals p
                where p.deleted_at is null and p.accepted_at is not null
                union all
                select 'PAYMENT_RECORDED', 'payment-recorded', pm.id, pm.created_at, null, pp.number, pm.amount, null, null
                from payments pm
                join proposals pp on pp.id = pm.proposal_id
                where pm.deleted_at is null
                union all
                select 'EXECUTION_COMPLETED', 'execution-completed', e.id, e.completed_at, null, null, null, e.scheduled_date, null
                from executions e
                where e.deleted_at is null and e.completed_at is not null
                union all
                select 'CLOSURE_CLOSED', 'closure-closed', sc.id, sc.closed_at, null, null, null, null, sc.status
                from service_closures sc
                where sc.deleted_at is null and sc.closed_at is not null
            ) ev
            order by ev.evt desc,
                     (ev.kind_slug || '-' || cast(ev.id as text)) collate "C" asc
            limit :limit
            """, nativeQuery = true)
    List<Object[]> recentActivity(@Param("limit") int limit);
}
