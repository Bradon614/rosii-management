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
- No local PostgreSQL is required yet; the backend starts without it

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

```bash
cd backend
./gradlew bootRun        # Windows: gradlew.bat bootRun
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

## Environment variables

Copy `.env.example` and export the variables before running the backend
(the application never stores credentials in the repository):

| Variable             | Purpose                          | Default (local dev)                     |
| -------------------- | -------------------------------- | --------------------------------------- |
| `DATABASE_URL`       | JDBC URL of the PostgreSQL DB    | `jdbc:postgresql://localhost:5432/rosii_management` |
| `DATABASE_USERNAME`  | Database user                    | `rosii`                                 |
| `DATABASE_PASSWORD`  | Database password                | *(empty)*                               |
| `SERVER_PORT`        | HTTP port of the backend API     | `8080`                                  |

Never commit real credentials, API keys or secrets. `.env` files are git-ignored.

## Current project status

**Feature 01 — Project foundation (implemented):**

- Monorepo structure (`desktop/`, `backend/`, `docs/`)
- Tauri 2 + React 19 + TypeScript + Vite + Tailwind CSS 4 with shadcn/ui foundation
  (design tokens, `cn` utility, `Button` component) and a minimal application shell
- Spring Boot 3 backend (Java 21, Gradle) with `GET /api/health` and a controller test
- PostgreSQL configured through environment variables; no migrations yet
- No business entities, no authentication, no synchronization yet

**Planned (not implemented):** clients, demands, projects, payments, reservations and
the other ROSII business modules; SQLite local storage with Drizzle ORM; offline-first
push/pull synchronization with the central PostgreSQL database; authentication.
