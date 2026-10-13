# M24: The surgical logbook and the resident hub

**Status: proposed on 2026-10-07. Not approved. Nothing of it is built.** Written at the owner's request ("build all the plans for the rest of the milestones according to the roadmap"). This is the plan at the depth that can be written today. When the milestone's turn comes, its §1 is redone against the code as it then stands and the plan is confirmed again before any code.

Track: Phase 2. Size: L. Needs first: The legal review of M20 for real use (this is the most sensitive data so far). The MedOps file format, from the owner.

## 0. What independence changes here (2026-10-13)

The owner decided on 2026-10-13 to build the product as independent of the association, with a section for it (plan M16). This plan was written before that, and its number moved up by two. A platform feature. The liability for a patient's details slipping in sits with the operator, so the legal review matters more.

## 1. Goal

A resident records the procedures they took part in, sees their training progress, and exports the log in a form MedOps accepts. A resident's home gathers logbook, exams, reading and cases.

**Why:** Specification §21 and §22; the roadmap names the MedOps-compatible export.

## 2. Scope

**In**

- A logbook entry: procedure (from a list), date, institution, role, supervisor, indication, outcome, complications, notes.
- **No identifiable patient information,** enforced: no name, no identity number, no date of birth, no free text that looks like one (the same check the importer uses, extended), and a standing note on the form.
- Totals by procedure, role and year; targets per training year if the owner supplies them.
- Export: CSV and the MedOps-compatible format; the resident's own data only.
- A supervisor's confirmation of an entry, if wanted (question 3).
- The resident hub: one screen with training progress, the logbook, exam preparation, a reading list, education for residents.
- On the site and in the app (entries are added on a phone, in the hospital).

**Not in**

- A medical record of any kind.
- Sending data to MedOps directly (export only).
- Programme directors seeing all residents (its own plan, with consent rules).

## 3. Rules

- A logbook belongs to its resident. Nobody else reads it unless the resident shares it, and staff with `audit` rights see only that it exists.
- Free-text fields pass the patient-details check before they are saved; a hit blocks saving and says why.
- The date of a procedure is stored as given, but exports can coarsen it to month if the legal review asks.
- Deleting an entry really deletes it.

## 4. What is built

**Data:** A procedures catalogue; `logbook_entries`; optional confirmations; a reading list.

- Server: a `logbook` module with its own read rule. Site and app: the form (fast to fill on a phone), lists, totals, export; the hub.

## 5. New libraries, services and costs (each needs the owner's approval)

- None expected; the export is text.

## 6. Tests

- Another member, a director and an administrator cannot read a resident's entries.
- The patient-details check: identity numbers, phone numbers, dates of birth and "name-like" patterns are refused; ordinary clinical text passes.
- The export matches the MedOps sample file byte for byte on a fixture.

## 7. Order of work (a commit at each step; tests green at each)

1. Plan approved, with the MedOps format in hand
2. The catalogue and the entry, with the privacy tests
3. Lists and totals
4. Export
5. Confirmation by a supervisor (if in)
6. The resident hub
7. App
8. Documents, status, demo

## 8. Risks

| Risk                                                               | What is done about it                                                                                                    |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| A resident types a patient's details anyway                        | The check, the standing note, and no place designed to hold them; said plainly as a residual risk in `SECURITY_MODEL.md` |
| The MedOps format is not documented                                | The plan cannot be approved without a sample file; without it the export is CSV only                                     |
| Combining date, hospital and rare procedure can point to a patient | Raised with the lawyer; coarser dates in exports is the fallback                                                         |

## 9. Questions for the owner

1. Can you supply a sample MedOps import file or its specification?
2. Which procedures, and are there required numbers per training year?
3. Should a supervisor confirm entries?
4. Who, if anyone, may see a resident's log besides the resident?

## 10. Owner answers

None yet.
