# 0004. Membership type and role are separate axes

- Status: Accepted
- Date: 2026-09-27
- Decision owner: project owner

## Context

The spec lists user types that mix what a person _is_ (full member, resident, student) with what they may _do_ (admin, content editor, department director).

## Decision

- **Membership type** (FULL_MEMBER, NON_FULL_MEMBER, RESIDENT, STUDENT, HONORARY_MEMBER) lives on `memberships`.
- **Roles** (SUPER_ADMIN, IUA_ADMIN, CONTENT_EDITOR, EVENT_ADMIN, …, DEPARTMENT_DIRECTOR) live on `user_roles`, optionally scoped (e.g. DEPARTMENT_DIRECTOR scoped to one department).
- Routes require **permissions** (`@RequirePermission('news.publish')`), mapped to roles in the database and seeded from code. GUEST means unauthenticated and isn't stored.
- Content access tiers are evaluated against membership type and status, not roles.

## Alternatives considered

- **A single "user type" enum:** simpler, but it can't represent a resident who edits content, or a director who is also a full member.

## Consequences

- A clear authorization model; scoped roles support the director approval chain.
- Two checks to reason about (permissions for actions, membership for content access), each tested separately.
