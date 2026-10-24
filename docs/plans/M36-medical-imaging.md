# M36: Medical imaging

**Status: approved by the owner on 2026-10-24 (§10). Building on branch `feat/m36-medical-imaging`.** First proposed the same day at the owner's request ("open a new milestone called medical imaging") and rewritten against the owner's answers.

Track: Phase 3. Size: XL (the full viewer, on the site and inside the app). Needs first: M26 (cases), whose pictures it extends; M6 (library). M20's legal review before any real scan is uploaded.

## 0. What was checked (2026-10-24)

- **The OHIF Viewer** (github.com/OHIF/Viewers, commit d5b8f56 of 2026-10-23) was cloned to `Desktop\OHIF Viewer`, outside this repository, for reading only. Nothing of it was installed or run.
- **OHIF's own licence is MIT** (Open Health Imaging Foundation, 2018), the same in all 24 of its packages. MIT allows use, change, copying, distribution and sale, in a free or paid, closed or open product, without paying or asking. It requires the copyright notice and licence text to stay with every copy. It gives no warranty.
- **Its 162 direct outside libraries** (looked up on the npm registry): 141 MIT, 9 ISC, 6 Apache-2.0, and one each of MIT-0, CC0, BlueOak, BSD-3 and Apache-2.0 with the LLVM exception. All of these allow the same use as MIT, some with a notice. **One is different: shepherd.js 15.3.0 is under the AGPL-3.0.** It draws OHIF's guided tours ("onboarding"). The AGPL would oblige us to publish the source of the whole product to its users. Its authors sell a commercial licence instead. **This plan proposes to build OHIF without the tours and without shepherd.js** (§4), and a test that fails the build if any AGPL or GPL library is in it.
- **Every library the viewer ships, checked (step 1, 2026-10-24):** OHIF's lock file lists exactly what it installs. Following only what the viewer ships (not the tools that build it, nor its documentation site) gives **1,086 libraries.** Their licences were looked up on the npm registry, without installing or running anything: 884 MIT, 56 ISC, and the rest Apache-2.0, BSD, BlueOak, CC0, 0BSD, Boost, Python-2.0, CC-BY-4.0 (a browser-support table, used only when building) and two whose files say MIT and Apache-2.0. **All allow our use, with a notice. The only exception is shepherd.js (AGPL-3.0),** used in three files, all for the tours; it is removed.
- **The version used:** OHIF **3.13.13**, the latest stable release (16 Oct 2026). It is older than the project's 7-day rule for new releases. The `DesktopOHIF Viewer` copy is a newer beta and is only for reading.
- **The licence is not the approval for patient care.** OHIF has been the basis of FDA-cleared viewers; that clearance belongs to those products. A viewer offered for diagnosis would likely be a medical device (the Ministry of Health's AMAR register in Israel; the MDR in Europe). This viewer is **for education and discussion only**, said on every screen, as cases say "for education, not advice about a patient".

## 1. Goal

A physician can look at a de-identified scan (CT, MRI, ultrasound, X-ray) in a case or a library item, scroll through it, change the window, measure and point at a finding, with the full OHIF viewer, on the site and inside the app.

**Why:** urology is read in images. Today a case takes up to 4 JPEG or PNG pictures and refuses scan files (DICOM).

## 2. Scope

**In**

- **The full OHIF viewer** (owner's answer 2), on the site.
- **In the app, inside it, not as a separate app or the phone's browser** (answer 3): the same viewer in a screen of the app (a web view), signed in as the member.
- **Scans in cases and in library items** (answer 1).
- **Every verified physician may upload a scan to their case**, as with pictures (answer 5); library items get scans from staff, as their files do today.
- **De-identification on upload, on the server, before anything is stored.** The DICOM header's names, numbers, dates, places and institution are removed or replaced; private tags are dropped. Burned-in text on the image itself is a known gap, handled by the author's confirmation, as with pictures.
- **A store that serves scans to the viewer only after the same access check as the case or item.**
- **Demo scans** (answer 4): two or three public, already de-identified teaching scans relevant to urology (for example from The Cancer Imaging Archive), each with its source and licence recorded, brought to the owner for approval before they are added.

**Not in**

- Anything for diagnosis or reporting; a link to a hospital's PACS; AI on images (M33); the guided tours.

## 3. Rules

- No scan is stored with a name, ID number, date of birth, date of the study, or institution. Upload is refused if de-identification fails.
- The author confirms, as for pictures, that nothing on the image itself identifies the patient.
- Scans in a case follow the case's review (M26): nobody but the author and the reviewers sees them before the case is approved.
- Every viewer screen says it is for education, not for diagnosis.
- OHIF's notice and licence, and those of its libraries, go into the product's notices page.

## 4. What is built

- **The viewer, built from OHIF's code with our settings:** our data source, he and en (OHIF has an i18n layer; Hebrew texts are added and right-to-left checked), the education-only label, and **without the tours and shepherd.js.** It is built as its own bundle and served by the site under `/viewer`, so the site's own pages stay as light as now. OHIF's source is kept as a pinned version, with our changes as a small, listed set.
- **Data:** a scan record (study, series, number of images, size, where stored) linked to a case or a library item.
- **Server:** upload of a scan (a folder of DICOM files or a zip), de-identification, storage outside the web root, and the standard DICOMweb read paths the viewer needs (study, series and image lists, and the images), behind the access check.
- **Site:** "View the scan" on a case and on a library item opens the viewer.
- **App:** the same buttons open the viewer in an app screen. The viewer reads the scan through a signed link to that one scan, valid for two hours and only for reading it (`scan-link.ts`), which the app asks for with its own sign-in. The person's session never goes into the viewer or into an address. (First written as a one-time sign-in code; the signed link, the pattern files already use, does the same with less: it opens one scan, not the account.)
- **Licence check in CI:** the build fails if an AGPL or GPL library appears in the viewer.

## 5. New libraries, services and costs (each needs the owner's approval)

- **OHIF Viewer 3.x** (MIT), without shepherd.js.
- **react-native-webview** (MIT), to show the viewer inside the app.
- **A DICOM library for the server** to read, de-identify and write files: **dcmjs** (MIT, from the same community as OHIF) is proposed.
- **Storage:** scans are tens to hundreds of MB. The demo stays with a few small scans; a size limit per scan (proposed: 200 MB); storage cost checked before real use.
- **Not proposed:** Orthanc as the image server. It is under the GPL (some plugins under the AGPL); serving the files ourselves avoids it.

## 6. Tests

- A scan with a planted name, ID number, dates and institution is uploaded; none of them is left in any stored file.
- Someone who cannot read the case or item cannot fetch its images; a case's scan is hidden until the case is approved.
- The viewer opens a demo scan on the site, in he and en; the page around it passes the accessibility checks.
- The app's case screen opens the viewer inside the app, signed in.
- The licence check fails on a planted AGPL library.

## 7. Order of work (a commit at each step; tests green at each)

1. Plan approved; a full install of OHIF in a separate folder to check every library's licence; libraries approved
2. Upload, de-identification and storage, with their tests
3. The DICOMweb read paths, with the access check
4. The viewer bundle: our data source, Hebrew, the label, no tours; served under `/viewer`
5. Cases and library items on the site
6. The app
7. Demo scans, after the owner approves them
8. Documents, status, demo

## 8. Risks

| Risk                                               | What is done about it                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| A scan keeps something that identifies the patient | Server-side removal, a refusal on failure, a test with planted details               |
| The viewer is taken as a diagnostic tool           | The education-only label; no reporting; M20's legal review before real use           |
| An AGPL library slips into the product             | shepherd.js removed; a CI check on every build                                       |
| OHIF is large and changes often                    | A pinned version; our changes kept small and listed; the viewer on its own page only |
| Large files on a small server                      | A size limit; a few small demo scans; storage costs checked before real use          |
| The viewer on a phone is heavy                     | Tried on a mid-range Android phone; the case's pictures stay as the light option     |

## 9. Questions for the owner

All answered (§10).

## 10. Owner answers

2026-10-24, approval: **"I approve the plan of M36"**; the libraries of §5: **yes**, subject to the full licence check (done, §0); the size limit of 200 MB per scan: **yes**.

2026-10-24, the five questions:

1. Where scans appear: **both**, cases and library items.
2. **The full OHIF viewer.**
3. In the app: **the full viewer, as part of the app, not separate.**
4. Demo scans: **yes**, public de-identified teaching scans, each brought for approval with its licence.
5. Who uploads: **yes**, every verified physician, as with case pictures.
