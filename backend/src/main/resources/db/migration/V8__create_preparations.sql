-- Feature 09: preparation of an accepted proposal whose required deposit has
-- been reached. Conventions: docs/database-conventions.md (snake_case, uuid ids,
-- timestamptz).
--
-- preparations only links the proposal: no commercial or financial data is
-- duplicated (the proposal stays the source of truth for client, demand, lines,
-- total, required deposit and payments). There is deliberately no status, task,
-- assignment or planning column: the business rules only define entry into
-- preparation after the deposit is reached, not an execution workflow.
--
-- proposal_id references proposals without ON DELETE CASCADE: proposals are only
-- soft-deleted and must keep their preparation history.
-- The partial unique index enforces one ACTIVE preparation per proposal (the
-- workflow defines a single preparation step); soft-deleting the preparation
-- releases the slot, following the ux_users_email_active pattern of V2.

CREATE TABLE preparations (
    id           uuid        PRIMARY KEY,
    proposal_id  uuid        NOT NULL REFERENCES proposals (id),
    created_at   timestamptz NOT NULL,
    updated_at   timestamptz NOT NULL,
    version      bigint      NOT NULL,
    deleted_at   timestamptz
);

CREATE UNIQUE INDEX ux_preparations_proposal_active
    ON preparations (proposal_id) WHERE deleted_at IS NULL;
