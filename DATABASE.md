# Database

The database design lives in [`DATABASE_DESIGN.md`](DATABASE_DESIGN.md). The Prisma schema at [`apps/api/prisma/schema.prisma`](apps/api/prisma/schema.prisma) is the implementation of record; raw SQL (extensions, functions, triggers, grants) is in the migrations under [`apps/api/prisma/migrations/`](apps/api/prisma/migrations).

Quick facts:

- PostgreSQL 16+, Prisma 7 with the `pg` driver adapter.
- Two roles: `iua_owner` (migrations) and `iua_app` (runtime). The app role's per-table restrictions are applied by migrations using the database setting `iua.app_role`.
- `audit_logs` is append-only (trigger + grants). `actor_user_id` has no foreign key on purpose: deleted accounts keep pseudonymous audit rows.
- Identity tables (M1): `users`, `roles`, `permissions`, `role_permissions`, `user_roles` (scoped; an unscoped role can be granted once, `NULLS NOT DISTINCT`), `devices`, `sessions`, `refresh_tokens`, `mfa_factors`, `recovery_codes`, `auth_tokens`. Tokens, codes and device cookies are stored only as keyed hashes; TOTP secrets are encrypted.
- Roles and permissions come from `packages/shared/src/roles.ts` through the reference seed (`pnpm db:seed`).
- **Time zone:** everything is stored in UTC. The databases default to UTC and every Prisma connection sets `TimeZone=UTC`: Prisma's pg adapter otherwise stores timestamps shifted by the server's offset (`apps/api/src/infra/prisma/pg-adapter.ts`).
- `normalize_he(text)` prepares Hebrew text for search (M7).
- Commands: `pnpm db:migrate`, `pnpm db:deploy`, `pnpm db:reset`, `pnpm db:seed`, `pnpm db:provision`.
