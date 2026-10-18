# M30: Clinical calculators

**Status: proposed on 2026-10-07; checked against the code and the questionnaires' terms on 2026-10-14 (§0b); approved by the owner on 2026-10-18 with the answers in §10.** Chosen by the owner on 2026-10-14 as the milestone after M17.

Track: Phase 3. Size: M. Needs first: A named physician to review every formula and interpretation.

## 0. What independence changes here (2026-10-13)

The owner decided on 2026-10-13 to build the product as independent of the association, with a section for it (plan M16). This plan was written before that, and its number moved up by two. A platform feature. Open calculators are also a reason for a physician to try the product before colleagues are there.

## 0b. What I checked on 2026-10-14

- **The code:** the member's home shows "Open a calculator" among the "coming soon" cards (`member-dashboard.tsx`, `LATER`). Nothing else exists. The site and the app already share packages (`@medconnect/shared`, `@medconnect/i18n`), so the calculators can be one new package of our own, `@medconnect/calculators`, used by both, with no outside library.
- **Who may use them:** since M17 an unverified person reads only what is open to everyone. A calculator stores nothing and sends nothing, so it can be open to everyone (question 3).
- **The terms of use, which decide what can be built:**
  - **IPSS:** listed as public domain ([LOINC 80976-4](https://loinc.org/80976-4)). Can be built. Its Hebrew wording needs the reviewer: I write it, and it is marked "not a validated translation" until the reviewer confirms it or gives the validated text.
  - **IIEF and SHIM (IIEF-5):** distributed by the Mapi Research Trust under a signed licence, with fees depending on use ([Mapi Research Trust](https://www.mapi-trust.org/questionnaires/questionnaires-distribute)). **Not built** unless the owner obtains a licence.
  - **TNM:** the AJCC and UICC tables are copyrighted; use in software is licensed by the AJCC ([HL7 note on TNM](https://terminology.hl7.org/CodeSystem-TNM.xml.html)). **Not built.** A link to the official source can be shown instead.
  - **RENAL, PADUA, S.T.O.N.E.:** published scoring rules, implemented from their papers with the reference shown. Can be built.
  - **PSA density, PSA velocity, creatinine clearance (Cockcroft-Gault), eGFR, stone volume:** formulas. Can be built.
- **"Stone parameters"** in the specification is not defined; I propose the stone's volume from its three diameters (the ellipsoid formula), beside the S.T.O.N.E. score.

So the first version has **nine**: IPSS, PSA density, PSA velocity, creatinine clearance, eGFR, stone volume, RENAL, PADUA, S.T.O.N.E.

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

My recommendation: **(1)** the owner reviews and signs each calculator; **(2)** eGFR by CKD-EPI 2021 (without race), and TNM left out (licence); **(3)** open to everyone, signed in or not; and IIEF/SHIM left out unless a licence is obtained.

1. Who reviews the formulas?
2. Which eGFR formula and TNM edition?
3. May visitors use the calculators, or members only?

## 10. Owner answers (2026-10-18)

The owner answered the four questions put in chat ("1.me 2.yes 3.everyone 4.yes"), which I take as approval of the plan as checked in §0b:

1. **The reviewer is the owner.** Each calculator shows "not yet reviewed" until the owner signs it; the name and date are then written into its definition.
2. **eGFR by CKD-EPI 2021, without race. TNM is left out** (licence), and so are IIEF and SHIM unless a licence is obtained.
3. **Open to everyone**, signed in or not, on the site and in the app.
4. **IPSS in Hebrew:** I write the text, marked "not a validated translation" until the owner confirms it or gives the validated version.

So the scope of §2 is the nine of §0b, not the twelve of the specification.

## 11. For the reviewer (built 2026-10-18)

Every calculator shows "not yet checked by the reviewing physician" until the owner signs it. Signing one means: the owner tells me which, with the name to show; I write the name and the date into its definition (`packages/calculators/src`), and the warning goes.

What to check in each, and what I could not confirm from the sources I could read (the original papers are behind paywalls; PubMed gave the abstracts):

| Calculator           | Built as                                                                                                                                                                        | To check                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IPSS                 | 7 questions 0–5, total 0–35: mild 0–7, moderate 8–19, severe 20–35; quality of life 0–6 apart; voiding (1, 3, 5, 6) and storage (2, 4, 7)                                       | The English wording against the AUA form; **the Hebrew wording is mine** (marked as not validated)                                                                            |
| PSA density          | PSA ÷ volume, 2 decimals; band at 0.15                                                                                                                                          | **The 0.15 cut-off is not in Benson 1992** (its abstract speaks of 0.1); 0.15 is the one in common use. Keep, change, or drop the band                                        |
| PSA velocity         | (last − first) ÷ years, from two values; band at 0.75 ng/mL/year (Carter 1992); a note when less than 18 months apart                                                           | Whether two values are enough, or three should be asked for                                                                                                                   |
| Creatinine clearance | Cockcroft-Gault, ×0.85 for a woman, actual weight as typed; creatinine in mg/dL or µmol/L (÷88.4)                                                                               | Whether to offer ideal or adjusted weight                                                                                                                                     |
| eGFR                 | CKD-EPI 2021 creatinine, without race; KDIGO G1–G5                                                                                                                              | Checked against the published equation (60-year-old man, 1.0 mg/dL → 86)                                                                                                      |
| Stone volume         | π/6 × L × W × D; area π/4 × L × W (Tiselius 2003)                                                                                                                               | —                                                                                                                                                                             |
| R.E.N.A.L.           | R ≤4 / >4–<7 / ≥7 cm; E; N ≥7 / >4–<7 / ≤4 mm; L; suffix a/p/x and h; low 4–6, moderate 7–9, high 10–12                                                                         | The wording of the L options                                                                                                                                                  |
| PADUA                | 6 parts, 6–14; size ≤4 / 4.1–7 / >7 cm; low 6–7, intermediate 8–9, high ≥10                                                                                                     | —                                                                                                                                                                             |
| S.T.O.N.E.           | S <400 / 400–799 / 800–1599 / ≥1600 mm²; T ≤100 / >100 mm; O none-mild 0, moderate-severe 1; N 1–2 / 3 / staghorn; E ≤950 / >950 HU; total 4–12; low 4–5, moderate 6–8, high ≥9 | **Not confirmed:** whether obstruction scores 0/1 (total 4–12, which fits the paper's reported range 4–11) or 1/2 (total 5–13, as some later papers say), and the three bands |

Limits refused with the range, no number given: age under 18 for creatinine clearance and eGFR; every value outside the range shown beside the field.
