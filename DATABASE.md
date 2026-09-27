# Database

The database design lives in [`DATABASE_DESIGN.md`](DATABASE_DESIGN.md). The Prisma schema at [`apps/api/prisma/schema.prisma`](apps/api/prisma/schema.prisma) is the implementation of record; raw SQL (extensions, functions, triggers, grants) is in the migrations under [`apps/api/prisma/migrations/`](apps/api/prisma/migrations).

Quick facts:

- PostgreSQL 16+, Prisma 7 with the `pg` driver adapter.
- Two roles: `iua_owner` (migrations) and `iua_app` (runtime). The app role's per-table restrictions are applied by migrations using the database setting `iua.app_role`.
- `audit_logs` is append-only (trigger + grants).
- `normalize_he(text)` prepares Hebrew text for search (M7).
- Commands: `pnpm db:migrate`, `pnpm db:deploy`, `pnpm db:reset`, `pnpm db:seed`, `pnpm db:provision`.
