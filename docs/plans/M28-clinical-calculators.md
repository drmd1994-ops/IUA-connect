# M28: Clinical calculators

**Status: proposed on 2026-10-07. Not approved. Nothing of it is built.** Written at the owner's request ("build all the plans for the rest of the milestones according to the roadmap"). This is the plan at the depth that can be written today. When the milestone's turn comes, its §1 is redone against the code as it then stands and the plan is confirmed again before any code.

Track: Phase 3. Size: M. Needs first: A named physician to review every formula and interpretation.

## 1. Goal

A member opens a calculator, fills it in, and gets a result with its interpretation, the reference it comes from, and a disclaimer.

**Why:** Specification §15 lists twelve. "Open Calculator" is already on the member's dashboard as "Coming soon".

## 2. Scope

**In**

- A framework: each calculator declares its inputs, validation, calculation, interpretation, reference and disclaimer in one file.
- The twelve of the specification: IPSS, SHIM, IIEF, PSA density, PSA velocity, RENAL score, PADUA, S.T.O.N.E. score, TNM, creatinine clearance, eGFR, stone parameters.
- Works without a connection in the app; nothing entered is sent or stored.
- On the site and in the app, in Hebrew and English.

**Not in**

- Storing results or linking them to a patient.
- Treatment recommendations.
- Calculators without a published reference.

## 3. Rules

- Nothing typed into a calculator leaves the device. There is no "save".
- Every calculator names its source, its version and who reviewed it, and when.
- A result outside the formula's valid range says so and gives no number.
- The disclaimer is always visible with the result.

## 4. What is built

**Data:** None. Calculators are code, shared by the site and the app in one package.

- A shared package of pure functions with their definitions; one screen that draws any calculator from its definition.

## 5. New libraries, services and costs (each needs the owner's approval)

- None expected.

## 6. Tests

- Every calculator against worked examples from its source publication, including edge values.
- Validation: impossible inputs are refused.
- Translations of questionnaires match the validated Hebrew versions where they exist.

## 7. Order of work (a commit at each step; tests green at each)

1. Plan approved, with the reviewer named
2. The framework and two calculators end to end
3. The questionnaires (IPSS, SHIM, IIEF)
4. The scores (RENAL, PADUA, S.T.O.N.E., TNM)
5. The formulas (PSA, clearance, eGFR, stone)
6. Review by the physician; corrections
7. App
8. Documents, status, demo

## 8. Risks

| Risk                                                            | What is done about it                                                                              |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| A wrong formula or cut-off                                      | Worked examples from the source as tests; a physician signs each one; the reviewer's name is shown |
| Questionnaires are copyrighted or have official Hebrew versions | Checked per questionnaire at checkpoint 1; only what may be used is built                          |

## 9. Questions for the owner

1. Who reviews the formulas?
2. Which eGFR formula and TNM edition?
3. May visitors use the calculators, or members only?

## 10. Owner answers

None yet.
