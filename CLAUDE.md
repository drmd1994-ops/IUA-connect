# CLAUDE.md — Med Connect (formerly IUA Connect)

At the start of every session, read `HANDOFF.md` and `PROJECT_STATUS.md` first. They hold the project context, the owner's decisions and the current milestone.

Standing rules:

- Windows, native. No Docker locally. Use PowerShell-compatible commands.
- Plan, then wait for the owner's approval before large implementation steps. Work one milestone at a time (`DEVELOPMENT_ROADMAP.md`).
- **Every milestone** starts with a written plan in `docs/plans/M<n>-<name>.md` that the owner explicitly approves before any code is written. Decisions not covered by an approved plan are asked, not assumed. Each milestone ends with green CI, an updated `PROJECT_STATUS.md` and a demo.
- Never overwrite or delete files without examining them first.
- No placeholder features presented as complete. No hard-coded UI strings (he/en via i18n). No secrets in the repo.
- Demo mode: fictional people only. No identifiable patient information. Don't import the IUA physician directory.
- Update `PROJECT_STATUS.md` when a milestone ends.
