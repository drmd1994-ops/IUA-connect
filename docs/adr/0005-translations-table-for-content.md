# 0005. Per-entity translation tables for content

- Status: Accepted (first used in M3)
- Date: 2026-09-27
- Decision owner: project owner (D6)

## Context

Hebrew and English at launch; Arabic and Russian later. UI strings and editorial content have different lifecycles and owners.

## Decision

- **UI strings:** JSON message files in `packages/i18n` (one folder per locale). Lint blocks hard-coded JSX text; a test keeps locale keys identical.
- **Content:** one translation table per entity, e.g. `news_translations(news_id, locale, title, summary, body)` with primary key `(news_id, locale)`. A missing translation falls back to Hebrew with a visible notice.

## Alternatives considered

- **Columns per language** (`title_he`, `title_en`): every new language is a schema change.
- **A JSON column per field:** hard to index and search per locale.
- **One generic translations table** (entity type, id, field, locale, value): flexible, but loses foreign keys and typed columns.

## Consequences

- Adding a locale needs no schema change. Full-text search vectors live on each translation row.
- Reads join the translation table for the requested locale (with fallback).
