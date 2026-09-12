-- Feature 05: service catalogue (backend foundation for proposals/quotes later).
-- Conventions: docs/database-conventions.md (snake_case, uuid ids, timestamptz).
--
-- category stores the ServiceCategory enum name (EnumType.STRING, like users.role).
-- reference_price is the catalogue reference price only: no pricing logic, and
-- future quote lines will carry their own historical price.
-- No indexes: search is substring-based ('%term%'), which a btree index cannot
-- serve, and the catalogue is small; add one later only if measured.

CREATE TABLE services (
    id              uuid           PRIMARY KEY,
    name            varchar(200)   NOT NULL,
    category        varchar(30)    NOT NULL,
    description     text,
    default_unit    varchar(50)    NOT NULL,
    reference_price numeric(14, 2) NOT NULL,
    active          boolean        NOT NULL DEFAULT TRUE,
    created_at      timestamptz    NOT NULL,
    updated_at      timestamptz    NOT NULL,
    version         bigint         NOT NULL,
    deleted_at      timestamptz
);
