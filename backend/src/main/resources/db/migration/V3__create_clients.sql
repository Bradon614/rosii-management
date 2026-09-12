-- Feature 04: clients (first business module).
-- Conventions: docs/database-conventions.md (snake_case, uuid ids, timestamptz).
--
-- Email is intentionally NOT unique: two clients may legitimately share an
-- address, and the business rules only mark it as optional.
-- No indexes: search is substring-based ('%term%'), which a btree index cannot
-- serve, and the V1 dataset is small; add an index later only if measured.

CREATE TABLE clients (
    id         uuid         PRIMARY KEY,
    name       varchar(200) NOT NULL,
    phone1     varchar(30)  NOT NULL,
    phone2     varchar(30),
    email      varchar(255),
    notes      text,
    created_at timestamptz  NOT NULL,
    updated_at timestamptz  NOT NULL,
    version    bigint       NOT NULL,
    deleted_at timestamptz
);
