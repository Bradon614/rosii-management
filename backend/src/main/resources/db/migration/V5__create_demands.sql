-- Feature 06: client demands (what the client requested) + optional event details.
-- Conventions: docs/database-conventions.md (snake_case, uuid ids, timestamptz).
--
-- client_id references clients without ON DELETE CASCADE: clients are only ever
-- soft-deleted, and a soft-deleted client must keep its historical demands.
-- demand_event_details.demand_id is UNIQUE: one demand has zero or one event
-- details record, whose lifecycle is owned by the demand (cascade/orphan
-- removal at the JPA level), so it carries no audit/version/soft-delete columns.
-- No indexes: search is substring-based ('%term%') across joined columns, which
-- a btree index cannot serve; the dataset is small. Revisit if measured.

CREATE TABLE demands (
    id               uuid           PRIMARY KEY,
    client_id        uuid           NOT NULL REFERENCES clients (id),
    type             varchar(30)    NOT NULL,
    status           varchar(40)    NOT NULL,
    requested_date   date,
    estimated_people integer,
    budget_type      varchar(10)    NOT NULL,
    budget_min       numeric(14, 2),
    budget_max       numeric(14, 2),
    location         varchar(500),
    notes            text,
    created_at       timestamptz    NOT NULL,
    updated_at       timestamptz    NOT NULL,
    version          bigint         NOT NULL,
    deleted_at       timestamptz
);

CREATE TABLE demand_event_details (
    id                           uuid          PRIMARY KEY,
    demand_id                    uuid          NOT NULL UNIQUE REFERENCES demands (id),
    event_type                   varchar(100)  NOT NULL,
    hall_needed                  boolean,
    desired_hall                 varchar(200),
    catering_requested           boolean,
    decoration_requested         boolean,
    florist_requested            boolean,
    equipment_rental_requested   boolean,
    transport_requested          boolean,
    theme                        varchar(500),
    notes                        text
);
