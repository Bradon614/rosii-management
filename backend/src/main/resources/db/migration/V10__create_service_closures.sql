-- Feature 11: closure of a preparation — the official end of a service after its
-- execution has COMPLETED (workflow ACCEPTED -> deposit reached -> preparation ->
-- execution COMPLETED -> closure).
-- Conventions: docs/database-conventions.md (snake_case, uuid ids, timestamptz).
--
-- service_closures is linked to exactly one preparation: the workflow defines a
-- single final closure per preparation. The partial unique index enforces it for
-- ACTIVE rows (same pattern as ux_executions_preparation_active in V9);
-- soft-deleting the closure releases the slot so a new closure may later be
-- created while the previous business rules still hold. The API re-checks every
-- workflow gate at creation time (existing preparation, ACCEPTED proposal,
-- reached deposit, COMPLETED execution, no active closure) — the schema only
-- guarantees the link, never stores derived money or workflow state.
--
-- status is 'COMPLETED' by default; 'WITH_ISSUE' lets the patronne close a
-- service despite a problem noted at the end. closed_at is stamped by the server
-- at creation (the client never provides it) and can never be modified.
--
-- final_notes is optional (max 2000 chars, enforced by API validation): any free
-- remark useful for history — no billing, notification or extra interpretation.
--
-- preparation_id references preparations without ON DELETE CASCADE: preparations
-- are only soft-deleted and must keep their closure history.
-- The index on preparation_id serves the preparationId filter of the list
-- endpoint (same rationale as idx_payments_proposal_id in V7).

CREATE TABLE service_closures (
    id              uuid         PRIMARY KEY,
    preparation_id  uuid         NOT NULL REFERENCES preparations (id),
    status          varchar(20)  NOT NULL,
    closed_at       timestamptz  NOT NULL,
    final_notes     text,
    created_at      timestamptz  NOT NULL,
    updated_at      timestamptz  NOT NULL,
    version         bigint       NOT NULL,
    deleted_at      timestamptz
);

CREATE INDEX idx_service_closures_preparation_id ON service_closures (preparation_id);

CREATE UNIQUE INDEX ux_service_closures_preparation_active
    ON service_closures (preparation_id) WHERE deleted_at IS NULL;