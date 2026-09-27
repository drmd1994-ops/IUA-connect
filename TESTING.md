# Testing

| Layer                  | Tool                                                               | Where                                                      | Command                                 |
| ---------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------- |
| API unit               | Jest + ts-jest (+ Supertest for pipeline tests without a database) | `apps/api/src/**/*.spec.ts`                                | `pnpm test`                             |
| API integration        | Jest + Supertest + real PostgreSQL                                 | `apps/api/test/**/*.int-spec.ts`                           | `pnpm test:integration`                 |
| Packages and web units | Vitest                                                             | `packages/*/src/**/*.test.ts`, `apps/web/src/**/*.test.ts` | `pnpm test`                             |
| E2E + accessibility    | Playwright + axe                                                   | `apps/web/e2e/`                                            | Added with the first user flows (M1/M2) |

## What the M0 suites prove

- **Deny by default** (`route-declarations.spec.ts`): every route in the real app declares `@Public()` or `@RequirePermission()`. A fixture proves the checker catches an undeclared route. `pipeline.spec.ts` proves the runtime guard: public → 200, no principal → 401, missing permission → 403, undeclared → 403 even for a principal holding every permission.
- **Error envelope:** unknown routes, validation failures (with field details, unknown keys rejected) and unexpected errors all return the envelope; internals never leak.
- **Correlation IDs:** created when missing, kept when well-formed, replaced when malformed, echoed in the header and the envelope.
- **Logging:** secrets are redacted; query strings are dropped.
- **Config:** production refuses demo adapters; error messages never contain secret values.
- **Audit log (integration):** entries are written and redacted; the app role has no UPDATE/DELETE/TRUNCATE privilege; the owner role is blocked by the trigger; `@Audited` routes record actor IP, target and correlation ID.
- **Database baseline (integration):** extensions present; `normalize_he` strips niqqud, folds final letters and splits on maqaf; the app role can't create tables or touch the migrations table.
- **Health (integration):** ready reflects the database; 503 without leaking connection details.
- **i18n:** he and en have identical keys; every API error code is translated. **Tokens:** WCAG AA contrast.

## Integration test database

`pnpm setup:dev` creates `iua_connect_test`. The integration suite migrates it before running (`test/global-setup.ts`) and connects as the application role, exactly like the running API. Tests use unique IDs and don't depend on an empty database; the audit log can't be cleaned anyway (append-only), so if a reset is ever needed, drop `iua_connect_test` as the superuser and re-run `pnpm db:provision`.

In CI, a PostgreSQL 16 service container is provisioned with the same script (`pnpm db:provision`).

## Conventions

- Test behavior through public interfaces; a failing test names what broke.
- Never weaken a security test to make a change pass; add the missing declaration or policy instead.
- Coverage target: above 80% for services and policies (PRODUCT_REQUIREMENTS §4).
