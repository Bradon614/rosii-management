-- Feature 08: payments/deposits for an accepted proposal.
-- Conventions: docs/database-conventions.md (snake_case, uuid ids, timestamptz).
--
-- proposals gains the requested deposit (required_deposit) and the timestamp of
-- its last change (required_deposit_updated_at). There is deliberately no
-- "updated by" column: the project has no actor-audit convention, and adding one
-- would mean parallel infrastructure. required_deposit is NOT NULL: the deposit
-- is decided when the proposal is created. Existing rows are backfilled with
-- their own line total (the only commercially meaningful default available at
-- migration time); proposals without lines get 0 and must be edited before they
-- can carry payments (a proposal can only be sent with at least one line).
--
-- payments.proposal_id references proposals without ON DELETE CASCADE: proposals
-- are only soft-deleted and must keep their payment history.
-- The financial status (totalPaid/remainingAmount/depositReached) is NEVER stored:
-- it is derived from the active payments of the proposal.
-- Index on proposal_id serves the per-proposal total and the proposalId filter.

ALTER TABLE proposals ADD COLUMN required_deposit numeric(14, 2);
ALTER TABLE proposals ADD COLUMN required_deposit_updated_at timestamptz;

UPDATE proposals p
SET required_deposit = COALESCE((
        SELECT SUM(ROUND(l.quantity * l.unit_price, 2))
        FROM proposal_lines l
        WHERE l.proposal_id = p.id
    ), 0);

ALTER TABLE proposals ALTER COLUMN required_deposit SET NOT NULL;

CREATE TABLE payments (
    id           uuid          PRIMARY KEY,
    proposal_id  uuid          NOT NULL REFERENCES proposals (id),
    amount       numeric(14, 2) NOT NULL,
    method       varchar(20)   NOT NULL,
    payment_date date          NOT NULL,
    reference    varchar(100),
    notes        text,
    created_at   timestamptz   NOT NULL,
    updated_at   timestamptz   NOT NULL,
    version      bigint        NOT NULL,
    deleted_at   timestamptz
);

CREATE INDEX idx_payments_proposal_id ON payments (proposal_id);
