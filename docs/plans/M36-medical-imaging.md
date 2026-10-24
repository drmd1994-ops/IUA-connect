# M36: Medical imaging

**Status: proposed on 2026-10-24 at the owner's request ("open a new milestone called medical imaging"). Not approved. Nothing of it is built.** Its scope depends on the answers in §9; the plan is rewritten against them and confirmed again before any code.

Track: Phase 3. Size: L to XL, depending on §9. Needs first: M26 (cases), whose pictures it extends. M20's legal review before any real scan is uploaded.

## 0. What was checked so far (2026-10-24)

- **The OHIF Viewer** (github.com/OHIF/Viewers, commit d5b8f56 of 2026-10-23) was cloned to `Desktop\OHIF Viewer`, outside this repository, for reading only. Nothing of it is installed or run, and nothing of it is in this repository.
- **Its licence is MIT** (Open Health Imaging Foundation, 2018). The same MIT licence is in each of its 24 packages (the app, core, i18n, every extension and mode), and all 29 `package.json` files say MIT.
- **MIT allows** use, change, copying, distribution and sale, in a free or a paid product, closed or open, without paying and without asking. **It requires** the copyright notice and the licence text to stay with every copy or substantial part. **It gives no warranty,** and the authors are not liable for anything.
- **Not yet checked:** the licences of the libraries OHIF itself pulls in (Cornerstone3D, the image codecs, the microscopy viewer and others). They are checked one by one, with `pnpm licenses`, for the parts actually used, before the owner approves the library.
- **Not a licence matter, but more important:** a licence lets us use the code; it does not make the product fit for diagnosis. OHIF says it has been the basis of FDA-cleared viewers; that clearance belongs to those products, not to OHIF or to us. A viewer offered for reading scans for a patient's care is likely a medical device (in Israel, the Ministry of Health's AMAR register; in Europe, the MDR). This plan therefore proposes a viewer **for education and discussion only**, said so on every screen, as M26 says "for education, not advice about a patient".

## 1. Goal

A physician can look at a de-identified scan (CT, MRI, ultrasound, X-ray) inside a case or a teaching item, scroll through it, change the window, measure and point at a finding, on the site and in the app.

**Why:** urology is read in images. Today a case (M26) takes up to 4 JPEG or PNG pictures and refuses scan files (DICOM).

## 2. Scope

**In (proposed; §9 decides)**

- The OHIF viewer, or only its drawing engine (Cornerstone3D), on the site.
- Scans attached to a case (M26) and, if the owner wants, to a library item (M6).
- De-identification on upload, on the server, before anything is stored: the DICOM header's names, numbers, dates, places and institution are removed; burned-in text on the image is a known gap, handled by the author's confirmation, as with pictures today.
- A store that serves the scans to the viewer only after the same access check as a case's pictures.
- In the app: the viewer opens in a web view, or the app shows still pictures only (§9).
- Demo: two or three public, already de-identified teaching scans, with their source and licence recorded.

**Not in**

- Anything for diagnosis or reporting; a link to a hospital's PACS; AI on images (M33).

## 3. Rules

- No scan is stored with a name, ID number, date of birth, date of the study or institution. Upload is refused if de-identification fails.
- The author confirms, as for pictures, that nothing on the image itself identifies the patient.
- Every viewer screen says it is for education, not for diagnosis.
- OHIF's copyright notice and licence go into the product's notices page and with any copy of its code.

## 4. What is built (proposed)

- **Data:** a scan record per case: series, number of images, size, and where it is stored.
- **Server:** upload and de-identification (a library that reads and writes DICOM; to be named and approved); serving the images to the viewer over the standard DICOMweb read paths, behind the access check.
- **Site:** a viewer page.
- **App:** per §9.

## 5. New libraries, services and costs (each needs the owner's approval)

- **OHIF Viewer or Cornerstone3D** (MIT). A large library; it raises the site's size and build time.
- **A DICOM reading and de-identification library** for the server (to be chosen).
- **Storage:** scans are 10s to 100s of MB each. The Railway volume and its cost need a check; the demo stays with a few small scans.
- **Not proposed:** Orthanc as the image server. It is under the GPL (some plugins under the AGPL), which would bind the product's licence; serving the files ourselves avoids it.

## 6. Tests

- A scan with a planted name, ID number and dates is uploaded; none of them is left in any stored file.
- Someone who cannot read the case cannot fetch its images.
- The viewer page opens a demo scan, in he and en, and passes the accessibility checks the other pages pass, as far as a viewer can.

## 7. Order of work (a commit at each step; tests green at each)

1. Plan approved, libraries approved
2. Upload, de-identification and storage, with their tests
3. The viewer on the site
4. The app
5. Demo scans
6. Documents, status, demo

## 8. Risks

| Risk                                               | What is done about it                                                      |
| -------------------------------------------------- | -------------------------------------------------------------------------- |
| A scan keeps something that identifies the patient | Server-side removal, a refusal on failure, a test with planted details     |
| The viewer is taken as a diagnostic tool           | The education-only label; no reporting; M20's legal review before real use |
| Large files on a small server                      | Size limits; a few small demo scans; storage costs checked before real use |
| A large library slows the site                     | The viewer loads only on its own page                                      |

## 9. Questions for the owner

1. **Where do scans appear?** In cases only, or in cases and library items too?
2. **The whole OHIF viewer, or only its engine** (simpler screen, smaller, but fewer tools)?
3. **In the app:** the full viewer in a web view, or still pictures only?
4. **Demo scans:** may I propose public de-identified teaching scans (for example from The Cancer Imaging Archive), each with its licence, for your approval?
5. **Who may upload scans:** every verified physician, as with case pictures, or fewer people at first?

## 10. Owner answers

None yet.
