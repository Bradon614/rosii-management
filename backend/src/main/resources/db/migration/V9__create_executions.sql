-- Feature 10: execution of a preparation — the operational follow-through of an
-- ACCEPTED proposal whose required deposit has been reached (workflow
-- ACCEPTED -> deposit reached -> preparation -> execution).
-- Conventions: docs/database-conventions.md (snake_case, uuid ids, timestamptz).
--
-- executions is linked 1:1 to preparations: the workflow defines exactly one
-- execution per preparation. The partial unique index enforces it for ACTIVE
-- rows (same pattern as ux_preparations_proposal_active in V8); soft-deleting
-- the execution releases the slot. The API re-checks the workflow gates
-- (ACCEPTED proposal + deposit reached) at creation time — the schema only
-- guarantees the link, never stores derived money or workflow state.
--
-- status starts at 'PLANNED' (initial value, set by the application) and moves
-- through the strict state machine (PLANNED -> IN_PROGRESS -> COMPLETED, plus
-- cancellation from PLANNED or IN_PROGRESS). started_at / completed_at /
-- cancelled_at are stamped server-side on the matching transition only — the
-- client can never provide them.
--
-- scheduled_date / start_time / end_time / location / notes are the operational
-- information: they are filled by the PUT (scheduled_date is made mandatory by
-- API validation — no automatic date is ever invented) and restricted by status
-- on update (all fields while PLANNED, location/notes only once IN_PROGRESS,
-- none once COMPLETED or CANCELLED).
--
-- preparation_id references preparations without ON DELETE CASCADE: preparations
-- are only soft-deleted and must keep their execution history.
-- Index on scheduled_date serves the scheduledDate filter of the list endpoint
-- (same rationale as idx_payments_proposal_id in V7).

CREATE TABLE executions (
    id              uuid        PRIMARY KEY,
    preparation_id  uuid        NOT NULL REFERENCES preparations (id),
    status          varchar(20) NOT NULL,
    scheduled_date  date,
    start_time      time,
    end_time        time,
    location        varchar(500),
    notes           text,
    started_at      timestamptz,
    completed_at    timestamptz,
    cancelled_at    timestamptz,
    created_at      timestamptz NOT NULL,
    updated_at      timestamptz NOT NULL,
    version         bigint      NOT NULL,
    deleted_at      timestamptz
);

CREATE UNIQUE INDEX ux_executions_preparation_active
    ON executions (preparation_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_executions_scheduled_date ON executions (scheduled_date);