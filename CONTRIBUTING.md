# Contributing to Med Connect

## Workflow

- Trunk-based: short-lived branches named `feat/<module>-<topic>`, `fix/<module>-<topic>`, PRs into `main`, squash merge.
- Every PR: green CI, tests, updated docs, and the checklist in the PR template.
- Work milestone by milestone (`DEVELOPMENT_ROADMAP.md`). Large steps start with a plan the owner approves.
- Decisions with a real alternative get an ADR in `docs/adr/` (copy the format of an existing one).
- `PROJECT_STATUS.md` is updated at the end of every milestone.

## Commits

[Conventional Commits](https://www.conventionalcommits.org), enforced by commitlint:
`feat(api): add verification decisions`, `fix(web): correct RTL padding in header`, `docs: ...`, `chore: ...`, `test: ...`.

Hooks (Husky): pre-commit runs Prettier on staged files and gitleaks (if installed); commit-msg runs commitlint.

## Per-feature order (spec §60)

Explain the architecture briefly → backend → database → API → frontend → tests → run tests → fix → docs → security check.

## Rules that are enforced by tooling

| Rule                                                                                                              | Enforced by                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Every API route declares `@Public()` or `@RequirePermission(...)`                                                 | Unit test `route-declarations.spec.ts` (fails the build) and the global `PermissionGuard` (denies at runtime) |
| Feature modules talk only through each other's `index.ts`; `common`/`infra`/`config` never import feature modules | `eslint-plugin-boundaries`                                                                                    |
| No hard-coded text in JSX                                                                                         | `i18next/no-literal-string`                                                                                   |
| he and en translation files have identical keys; every API error code has a translation                           | Unit tests in `packages/i18n` and `apps/api`                                                                  |
| Design-token color pairs meet WCAG 2.2 AA contrast                                                                | Unit test in `packages/ui-tokens`                                                                             |
| The generated API client matches the API                                                                          | CI (`pnpm openapi:generate` + `git diff --exit-code`)                                                         |
| No secrets committed                                                                                              | gitleaks (pre-commit + CI)                                                                                    |

## API conventions (details in `API_DESIGN.md`)

- Services throw `AppException('<ERROR_CODE>')`; codes live in `packages/shared/src/errors.ts` with an i18n key in `packages/i18n`.
- Request bodies are Zod `z.strictObject(...)` DTOs (`createZodDto`), so unknown keys are rejected.
- Mutating routes that change state someone should be accountable for get `@Audited({ action, entityType })`, or call `AuditService.record` with a before/after digest.
- A module accesses only its own tables through Prisma.

## Web conventions

- All UI text via `useTranslations` / `getTranslations`; add keys to both `he` and `en`.
- Layout with logical properties (`ps-`, `pe-`, `ms-`, `me-`, `start-`, `end-`), never `left`/`right`.
- Links through `@/i18n/navigation` (locale-aware), not `next/link`.
- Features that aren't built are shown disabled and labelled "Coming soon", never as working controls.

## Demo data

Fictional people only. Never import the IUA physician directory. No identifiable patient information anywhere.
