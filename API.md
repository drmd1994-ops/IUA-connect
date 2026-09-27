# API

The API design and conventions are in [`API_DESIGN.md`](API_DESIGN.md).

- Base path `/api/v1`; health probes at `/health/live` and `/health/ready` (unversioned).
- OpenAPI 3.1 is generated from the NestJS decorators and Zod DTOs. Swagger UI: `/api/docs` in development only.
- The committed document is [`packages/api-client/openapi.json`](packages/api-client/openapi.json); the typed client in `packages/api-client` is generated from it with `pnpm openapi:generate`. CI fails if it's stale.
- Errors always use the envelope `{ error: { code, message (i18n key), details?, correlationId } }`.
