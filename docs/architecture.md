# Architecture

This document describes the target architecture of ROSII Management and what is
actually implemented at the current stage. Anything marked *planned* does not exist
in the code yet.

## Overview

```
┌────────────────────────────────────────────┐
│ Desktop app (patronne's machine)           │
│   Tauri 2 shell (Rust)                     │
│   React + TypeScript + Tailwind + shadcn/ui│
│   SQLite local store (planned, Drizzle)    │
└──────────────┬─────────────────────────────┘
               │ REST (planned sync + API calls)
┌──────────────▼─────────────────────────────┐
│ Backend                                    │
│   Spring Boot 3 (Java 21, Gradle)          │
│   REST API (/api/...)                      │
└──────────────┬─────────────────────────────┘
               │
┌──────────────▼─────────────────────────────┐
│ Central database                           │
│   PostgreSQL                               │
└────────────────────────────────────────────┘
```

## Desktop application (`desktop/`)

- **Tauri 2** hosts the front end in a native window (`desktop/src-tauri`).
  The Rust side is intentionally minimal: no plugins, no custom commands yet.
- **Vite + React 19 + TypeScript (strict)** in `desktop/src`.
- **Tailwind CSS 4** via `@tailwindcss/vite`; design tokens defined in
  `src/index.css` following the shadcn/ui convention (`components.json` is present so
  `npx shadcn add <component>` works out of the box).
- **SQLite + Drizzle ORM** will be introduced when the offline data layer is built
  (*planned*).

## Backend (`backend/`)

- Base package: `mg.rosii.management`.
- Spring Web, Validation, Data JPA; PostgreSQL JDBC driver on the runtime classpath.
- `GET /api/health` → `{"status":"UP"}` for liveness checks.
- All database configuration comes from environment variables
  (`DATABASE_URL`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`); no credentials in code.
- The explicit Hibernate dialect in `application.yml` lets the application boot
  without a live database during the foundation stage.

## Synchronization (*planned*)

The desktop app will remain fully usable offline against SQLite and synchronize with
the central PostgreSQL database:

- push/pull synchronization endpoints
- `operationId` idempotency for retried operations
- `changeSequence` cursor to track what has been pulled
- optimistic versioning on entities
- `SyncConflict` and `ChangeLog` / `AuditLog` records

None of this is implemented yet.
