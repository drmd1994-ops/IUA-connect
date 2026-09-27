# 0001. Modular monolith

- Status: Accepted
- Date: 2026-09-27
- Decision owner: project owner

## Context

One developer now, 2–3 later; demo mode; a native Windows development environment without Docker. The platform spans many domains (membership, content, events, later CME, community, voting).

## Decision

One NestJS API process and one PostgreSQL database, split into modules with strict boundaries (ARCHITECTURE.md §1). A module owns its tables and exposes a service through its `index.ts`; other modules never query its tables. Boundaries are enforced by `eslint-plugin-boundaries`.

## Alternatives considered

- **Microservices:** independent deployment and scaling, but high operational cost (service discovery, distributed transactions, several databases) with no benefit at this size.
- **Unstructured monolith:** fastest start, but modules become entangled and hard to extract later.

## Consequences

- Simple local setup and deployment; in-process calls and transactions.
- A module can be extracted later (voting is the likely first candidate) without rewriting callers, as long as the boundaries hold.
