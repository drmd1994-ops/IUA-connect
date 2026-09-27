# 0003. pg-boss (PostgreSQL) instead of Redis for jobs in demo mode

- Status: Accepted (queue introduced in M3)
- Date: 2026-09-27
- Decision owner: project owner (D15)

## Context

Scheduled publishing, reminders and emails need a job queue. The demo runs natively on Windows, where Redis isn't officially supported.

## Decision

Use pg-boss, which stores jobs in PostgreSQL (its own `pgboss` schema), behind a `JobQueue` interface. Rate limiting uses an in-memory store behind a `RateLimitStore` interface.

## Alternatives considered

- **BullMQ + Redis:** very capable, but every developer would need Redis (e.g. Memurai on Windows).
- **Cron only:** no retries, no visibility into failed jobs.

## Consequences

- PostgreSQL is the only infrastructure dependency for the demo.
- In-memory rate limits don't work across several API instances; the Redis adapter is required before scaling out.
