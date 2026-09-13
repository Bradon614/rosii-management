# ROSII Management

Professional **offline-first desktop business management application** for Group Chez Rosii
(Madagascar): catering, decoration, florist services, equipment rental, merchandise
transportation, car rental, real estate and construction.

The project is in its **foundation stage** (Feature 01). It contains no business
functionality yet — only the technical skeleton the upcoming features will build on.

## Main technologies

| Layer            | Technology                                        |
| ---------------- | ------------------------------------------------- |
| Desktop shell    | Tauri 2 (Rust)                                    |
| Frontend         | React 19, TypeScript, Vite, Tailwind CSS 4, shadcn/ui |
| Backend          | Java 21, Spring Boot 3, Gradle                    |
| API              | REST                                              |
| Security         | Spring Security, JWT (HMAC), BCrypt passwords     |
| Migrations       | Flyway (PostgreSQL)                               |
| Local database   | SQLite + Drizzle ORM (planned)                    |
| Central database | PostgreSQL                                        |

The application is intended to become an **offline-first desktop application**:
the patronne will work against a local SQLite database and synchronize with a central
PostgreSQL database (push/pull sync, idempotent operations, change cursors, conflict
handling). Synchronization is **not implemented yet**.

## Repository structure

```
rosii-management/
├── desktop/          # Tauri 2 + React + TypeScript application
│   ├── src/          # React front end (Vite + Tailwind + shadcn/ui)
│   ├── src-tauri/    # Tauri/Rust shell
│   └── ...
├── backend/          # Spring Boot REST API
│   ├── src/main/     # Application code
│   └── src/test/     # Tests
├── docs/             # Architecture notes and documentation
├── .env.example      # Environment variable template
└── README.md
```

## Prerequisites

- Node.js 20+ and npm
- Rust (stable, MSVC toolchain on Windows) — for the Tauri desktop shell
- Java 21 (JDK) — for the backend
- Docker (optional) — runs the PostgreSQL integration tests via Testcontainers
- A local PostgreSQL is optional; see below for running without a database

## Running the desktop application

Development mode (opens a native window served by Vite):

```bash
cd desktop
npm install
npm run tauri dev
```

Front-end only (browser, no Tauri window):

```bash
cd desktop
npm run dev       # http://localhost:5173
npm run build     # typecheck + production build
```

## Running the backend

The backend requires `JWT_SECRET` (see below) and a reachable PostgreSQL; Flyway
applies migrations on startup:

```bash
cd backend
export JWT_SECRET="$(openssl rand -base64 48)"
./gradlew bootRun        # Windows: gradlew.bat bootRun
```

Without PostgreSQL (set `FLYWAY_ENABLED=false`; for frontend/backend dev only):

```bash
FLYWAY_ENABLED=false ./gradlew bootRun
```

Then check the health endpoint:

```
GET http://localhost:8080/api/health
→ {"status":"UP"}
```

Run the tests:

```bash
./gradlew test
```

Integration tests that need PostgreSQL (Testcontainers) skip automatically when
Docker is not available.

## Environment variables

Copy `.env.example` and export the variables before running the backend
(the application never stores credentials in the repository):

| Variable             | Purpose                          | Default (local dev)                     |
| -------------------- | -------------------------------- | --------------------------------------- |
| `DATABASE_URL`       | JDBC URL of the PostgreSQL DB    | `jdbc:postgresql://localhost:5432/rosii_management` |
| `DATABASE_USERNAME`  | Database user                    | `rosii`                                 |
| `DATABASE_PASSWORD`  | Database password                | *(empty)*                               |
| `SERVER_PORT`        | HTTP port of the backend API     | `8080`                                  |
| `FLYWAY_ENABLED`     | Run migrations on startup        | `true` (set `false` to boot without a DB) |
| `JWT_SECRET`         | JWT signing key (≥ 32 chars)     | **required** — backend refuses to start without it |
| `JWT_EXPIRATION`     | Access-token lifetime (seconds)  | `3600`                                  |

Generate a strong secret, e.g. `openssl rand -base64 48`. The backend fails fast
if `JWT_SECRET` is missing or too short — no default key is ever shipped.

Never commit real credentials, API keys or secrets. `.env` files are git-ignored;
`.env.example` is the placeholder template.

## Continuous integration

GitHub Actions (`.github/workflows/ci.yml`) runs on pull requests to `main` and on
pushes to `main`:

- **Backend tests** — Java 21 + `./gradlew build` (compile, full test suite, boot jar).
  The Testcontainers PostgreSQL integration tests run there, since GitHub Linux
  runners provide Docker.
- **Frontend build** — `npm ci` + `npm run build` (strict TypeScript check and Vite
  production build). The native Tauri bundle is not built in CI yet.

The CI needs no secrets: integration tests provide their own database container and
a test-only JWT value.

## Current project status

**Feature 06 — Demand management (implemented, online API only):**

- `Demand` entity referencing an existing active `Client` (UUID id, `type`, `status`,
  optional `requestedDate`/`estimatedPeople`/`location`/`notes`, `budgetType` with
  consistent `budgetMin`/`budgetMax` as BigDecimal, audit timestamps, `version`,
  `deleted_at`) plus a one-to-one optional `DemandEventDetails` (free-text
  `eventType`, nullable tri-state service-request Booleans) — created by Flyway
  migration `V5__create_demands.sql`
- REST API under `/api/demands`: create (defaults to status `NEW`), list with
  combinable `search`/`clientId`/`type`/`status` filters (newest first), get by id,
  update with optimistic-locking version check (409 on stale), soft delete
- A Demand records **what the client requested** only: no proposal, quote,
  reservation or availability logic — `ACCEPTED` does not confirm a reservation
- **Frontend demand UI and offline/synchronization support are NOT implemented yet**

**Feature 05 — Service catalogue (implemented, online API only):**

- `Service` entity (UUID id, `name`, fixed `category` enum covering the ten ROSII
  activities, optional `description`, `defaultUnit`, `referencePrice` as BigDecimal,
  `active` flag, audit timestamps, `version`, `deleted_at`) created by Flyway
  migration `V4__create_services.sql`
- REST API under `/api/services`: create, list with combined `search`/`category`/`active`
  filters (case-insensitive, deterministic name ordering), get by id, update with
  optimistic-locking version check (409 on stale), `PATCH /{id}/active` to
  activate/deactivate, and soft delete
- `referencePrice` is catalogue reference only — no pricing, tax, discount or
  currency logic; future quotes will keep their own historical prices
- **Frontend catalogue UI and offline/synchronization support are NOT implemented yet**

**Feature 04 — Client management (implemented, online API only):**

- `Client` entity (UUID id, `name`, `phone1` required, optional `phone2`/`email`/`notes`,
  audit timestamps, `version`, `deleted_at`) created by Flyway migration `V3__create_clients.sql`
- REST API under `/api/clients`: create, list, search (`?search=` on name/phones/email,
  case-insensitive), get by id, update, and **soft delete** (row is kept; deleted clients
  disappear from the API and return 404)
- Email optional and normalized to lowercase; **not unique** (two clients may share it)
- All endpoints require the existing JWT authentication; concurrent updates answer 409
- **Frontend Client UI and offline/synchronization support are NOT implemented yet**

**Feature 03 — Authentication (implemented, online only):**

- `User` entity (UUID id, email, BCrypt `password_hash`, role, audit timestamps,
  `version`, `deleted_at`) created by Flyway migration `V2__create_users.sql`
- Single role in V1: **`PATRONNE`** — employees do **not** have accounts in V1
- `POST /api/auth/login` returns a signed JWT (HS256) + user identity
- `POST /api/auth/setup` creates the initial patronne account **once** (closed with
  409 as soon as any active user exists) — no credentials in Git or migrations
- `GET /api/auth/me` returns the authenticated identity (session restoration)
- Spring Security: stateless, `/api/health` and the auth endpoints public, everything
  else authenticated; invalid/expired tokens → 401; no enumeration of existing emails
- **Offline authentication on the desktop is NOT implemented yet** (later feature)

**Feature 02 — Database foundation (implemented):**

- PostgreSQL configuration fully environment-based
- Flyway migrations enabled (`V1__database_baseline.sql`); schema owned by migrations,
  Hibernate `ddl-auto: none`
- Conventions established and documented in
  [docs/database-conventions.md](docs/database-conventions.md): UUID application-generated
  primary keys, UTC audit timestamps (Spring Data JPA auditing), optimistic `@Version`
  locking, `deleted_at` soft deletion, snake_case naming
- PostgreSQL integration tests prepared with Testcontainers (skipped without Docker)

**Feature 01 — Project foundation (implemented):**

- Monorepo structure (`desktop/`, `backend/`, `docs/`)
- Tauri 2 + React 19 + TypeScript + Vite + Tailwind CSS 4 with shadcn/ui foundation
  (design tokens, `cn` utility, `Button` component) and a minimal application shell
- Spring Boot 3 backend (Java 21, Gradle) with `GET /api/health` and a controller test
- No business entities, no authentication, no synchronization yet

**Planned (not implemented):** clients, demands, projects, payments, reservations and
the other ROSII business modules; SQLite local storage with Drizzle ORM; offline-first
push/pull synchronization with the central PostgreSQL database; authentication.
