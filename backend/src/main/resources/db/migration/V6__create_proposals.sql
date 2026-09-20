-- Feature 07: commercial proposals/quotes (devis) + their lines.
-- Conventions: docs/database-conventions.md (snake_case, uuid ids, timestamptz).
--
-- proposals.demand_id is NOT NULL: every proposal originates from a demand
-- (Decision A). Both client_id and demand_id reference without ON DELETE
-- CASCADE: parents are only ever soft-deleted and must keep proposal history.
-- proposals.number is UNIQUE: the human-readable PROP-YYYY-NNNN number.
-- proposal_lines.proposal_id is NOT NULL; a line's lifecycle is owned by its
-- proposal (cascade/orphan removal at the JPA level), so it carries no
-- audit/version/soft-delete columns. service_id is nullable: a line may be
-- free-form, and the snapshot columns (description/unit/unit_price) keep the
-- commercial values independently of the catalogue.
-- Indexes on the FK columns serve the list filters (clientId/demandId) and
-- the join; number is already covered by its UNIQUE constraint.

CREATE TABLE proposals (
    id            uuid          PRIMARY KEY,
    number        varchar(20)   NOT NULL UNIQUE,
    client_id     uuid          NOT NULL REFERENCES clients (id),
    demand_id     uuid          NOT NULL REFERENCES demands (id),
    status        varchar(20)   NOT NULL,
    title         varchar(200),
    sent_at       timestamptz,
    accepted_at   timestamptz,
    refused_at    timestamptz,
    cancelled_at  timestamptz,
    valid_until   date,
    notes         text,
    created_at    timestamptz   NOT NULL,
    updated_at    timestamptz   NOT NULL,
    version       bigint        NOT NULL,
    deleted_at    timestamptz
);

CREATE TABLE proposal_lines (
    id           uuid            PRIMARY KEY,
    proposal_id  uuid            NOT NULL REFERENCES proposals (id),
    service_id   uuid            REFERENCES services (id),
    description  varchar(500)    NOT NULL,
    unit         varchar(50)     NOT NULL,
    quantity     numeric(14, 3)  NOT NULL,
    unit_price   numeric(14, 2)  NOT NULL,
    notes        text
);

CREATE INDEX idx_proposals_client_id        ON proposals (client_id);
CREATE INDEX idx_proposals_demand_id        ON proposals (demand_id);
CREATE INDEX idx_proposal_lines_proposal_id ON proposal_lines (proposal_id);
