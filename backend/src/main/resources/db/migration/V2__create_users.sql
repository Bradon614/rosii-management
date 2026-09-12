-- Feature 03: application users (patronne account).
-- Conventions: docs/database-conventions.md (snake_case, uuid ids, timestamptz).

CREATE TABLE users (
    id            uuid          PRIMARY KEY,
    email         varchar(255)  NOT NULL,
    password_hash varchar(255)  NOT NULL,
    role          varchar(20)   NOT NULL,
    created_at    timestamptz   NOT NULL,
    updated_at    timestamptz   NOT NULL,
    version       bigint        NOT NULL,
    deleted_at    timestamptz
);

-- Email must be unique among ACTIVE users only: soft-deleted accounts
-- release their email so it can be reused later.
CREATE UNIQUE INDEX ux_users_email_active ON users (email) WHERE deleted_at IS NULL;
