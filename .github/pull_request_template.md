## What and why

<!-- One or two sentences. Link the milestone (DEVELOPMENT_ROADMAP.md) and any ADR. -->

## How it was tested

- [ ] Unit tests added or updated (`pnpm test`)
- [ ] Integration tests added or updated where the database is involved (`pnpm test:integration`)
- [ ] Checked in the browser in **Hebrew (RTL)** and **English (LTR)**, if the UI changed

## Definition of done (spec §62)

- [ ] Implemented, tested, documented, integrated
- [ ] Accessible (keyboard, screen reader labels, contrast) and responsive
- [ ] Localized: no hard-coded UI strings; he and en keys added
- [ ] Errors handled (loading, empty, error and retry states; API errors use the envelope)
- [ ] Nothing unfinished is presented as working ("Coming soon" is disabled and labelled)
- [ ] `PROJECT_STATUS.md` / docs updated if behavior or decisions changed

## Security checklist (spec §60 step 10)

- [ ] Every new route declares `@Public()` or `@RequirePermission(...)`; resource-level checks live in service policies
- [ ] Inputs validated with Zod (strict objects, unknown keys rejected)
- [ ] No secrets, tokens, passwords, certificate numbers or patient information in code, logs, fixtures or audit diffs
- [ ] Mutating admin/member actions are audited
- [ ] Demo data is fictional; nothing from the IUA physician directory
- [ ] New dependencies are necessary, maintained, and pass `pnpm audit`
