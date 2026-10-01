# M4 — Content import: plan

- Status: **Draft, waiting for the owner's approval**
- Date: 2026-10-01
- Roadmap: `DEVELOPMENT_ROADMAP.md` §3, M4. Design sources:
  - `PROJECT_STATUS.md` D11 (curated sample; no physician directory) and O4 (permission before the pitch)
  - `DATABASE_DESIGN.md` §6 (seed layer 3, fixtures in `apps/api/prisma/fixtures/iua-import/`)
  - `PRODUCT_REQUIREMENTS.md` §3.5 ("Source: IUA website" attribution) and §3.8 (guidelines: details and links only)
  - `SECURITY_MODEL.md` (imported content holds no personal data beyond bylines)
  - `ARCHITECTURE.md` §4 (a one-off import tool)
  - Spec §14 (no copied guideline documents)

## 1. Goal and exit criteria

The demo shows a small, real-looking sample of the association's own website content: recent news, and the association's guidelines and position papers as details with links. Each item keeps its original date and names its source.

**Exit criteria (roadmap):**

- The import is repeatable and idempotent: running it again changes nothing.
- Every imported item keeps its source attribution (link and original date).
- No directory data is imported (no physician or member listings).
- The standing ones: CI green, `PROJECT_STATUS.md` updated, a demo.

## 2. What the source site looks like (checked 2026-10-01)

| Section                             | Address                                  | Use in M4                          |
| ----------------------------------- | ---------------------------------------- | ---------------------------------- |
| News                                | `Articles.aspx`, `ViewArticle.aspx?aId=` | Yes: news items                    |
| Clinical guidelines                 | `ViewContent.aspx?CategoryId=9249`       | Yes: guideline details and links   |
| Position papers                     | `ViewContent.aspx?CategoryId=9240`       | Yes: guideline details and links   |
| Conferences (in Israel, abroad)     | `CategoryId=9304`, `9305`                | Fixtures only; loaded in M5 (§11)  |
| Consent forms, newsletter           | `CategoryId=9184`, `9307`                | No (no module for them in the MVP) |
| Physician directory (on ima.org.il) | `ima.org.il/DoctorsIndex`                | **Never** (D11)                    |

- The site is in Hebrew. Items show a date.
- The footer says all rights to the information belong to the Israeli Medical Association (open item O4).
- `robots.txt` allows general crawlers on the content pages, blocks sign-in and form pages, and **blocks one AI company's crawler (GPTBot) from the whole site**. That is a signal about automated AI collection. The importer is not a crawler (§3), but this is one more reason to get permission before the pitch.

## 3. Scope

**In M4**

1. **`tools/importer`** (a command-line tool, development only)
   - Reads a **hand-picked list of page addresses** (`sources.json`), chosen by the owner. It never follows links, never lists the site and never reads the directory.
   - **Refuses any address outside the allowed sections** (§2), including anything under `DoctorsIndex`, sign-in or form pages. This is checked by a test.
   - Fetches each page once, politely: one request at a time, a pause between requests, a clear user-agent naming the project, and it obeys `robots.txt`.
   - Extracts: title, date, a short excerpt (§11) and the page address. For guidelines: title, date, the link to the document, and the organisation named on the page.
   - Writes **JSON fixtures** to `apps/api/prisma/fixtures/iua-import/`. The fixtures are committed; the fetched HTML is not.
   - Strips anything that isn't article text: scripts, forms, navigation, images, email addresses and phone numbers.
2. **Seed layer 3 ("import")**
   - Loads the fixtures into the database. It needs no network.
   - Idempotent: each item is matched by its source address, so a second run creates nothing and changes nothing.
   - News: Hebrew text, original date in `source_published_at`, `source_url`, status PUBLISHED, access PUBLIC (D7), a new category "From the IUA website", no author account. History records an `import` entry.
   - Guidelines: source organisation, title, the official link, one version with the date shown on the site, status CURRENT. **No documents are downloaded or stored** (spec §14).
3. **Attribution in the web app**
   - News already shows "Originally published at" with the source site. M4 adds a visible "Source: IUA website" label on imported items in the list too.
   - Guideline pages already link to the official document.
4. **A removal switch:** `pnpm import:remove` deletes everything the import created (matched by source address), so the sample can be taken out of the demo at once if permission is refused.
5. **Docs:** how to choose sources, run the importer, review the fixtures and load them.

**Not in M4**

| Item                                   | Where                                            |
| -------------------------------------- | ------------------------------------------------ |
| Showing conference items               | M5 (M4 only commits their fixtures; §11)         |
| Consent forms, newsletters, documents  | No module in the MVP                             |
| English translations of imported items | Not planned: items fall back to Hebrew, as built |
| Images from the source site            | Not imported (rights, and they aren't needed)    |
| Scheduled or repeated syncing          | Never in the MVP: this is a one-off sample (D11) |
| The physician directory                | Never (D11)                                      |

## 4. How the import stays safe

- **No personal data:** only bylines as printed. A check fails the import if a fixture contains an email address, a phone number or an Israeli ID-like number.
- **No directory:** the address allow-list is the first check, and it is tested with directory addresses.
- **Untrusted HTML:** the text goes through the same Markdown sanitiser as editor-written news (M3), so no HTML, scripts or unsafe links reach the database.
- **Reviewable:** fixtures are plain JSON in the repository. The owner reads them in the pull request before they reach any database.
- **Reversible:** the removal switch (§3.4).
- **Development only:** the importer and the seed refuse to run in production, like the other seed layers.

## 5. Database

No new tables. One migration:

- A unique index on `news.source_url` (where not null), so one source page can only ever be one item.
- `guidelines.source_url` (nullable, unique where not null): the page the entry was imported from. It marks imported guidelines for idempotency and removal.

## 6. API and web

- No new endpoints.
- Public news list item gains `sourceUrl` so the list can show the source label (the article page has it already).
- New texts in he/en: the source label and the new category name.

## 7. Tests

- **Unit (importer):**
  - The address allow-list: allowed sections pass; directory, sign-in, forms and other hosts are refused.
  - Extraction from saved sample pages (small HTML snippets written for the tests, not copies of the site): title, date formats (`31.01.2026`), text, links.
  - The personal-data check catches emails, phone numbers and ID-like numbers.
  - `robots.txt` rules are obeyed.
- **Integration (seed layer 3), with fictional fixtures:**
  - Loading twice creates each item once and changes nothing the second time.
  - Imported news is public, keeps its original date and source address, and appears in the public list.
  - Imported guidelines keep the official link and store no file.
  - The removal switch deletes exactly the imported items and nothing else.
- **End to end:** a visitor opens an imported news item and sees the source label and link; axe checks on that page.
- CI never fetches the real site: tests use test fixtures only.

## 8. Order of work (a commit at each checkpoint; tests green at each)

1. Importer: address allow-list, polite fetching, extraction, personal-data check; unit tests.
2. Migration; seed layer 3; removal switch; integration tests.
3. Claude proposes the source list and the owner approves it (§11). Run the importer; the owner reviews the fixtures in the pull request.
4. Web: source label; end-to-end test; docs; `PROJECT_STATUS.md`; demo.

Git: branch `feat/content-import`, pull request into `main` (Claude pushes and opens it; you review, and merge or ask Claude to).

## 9. Questions for the owner

1. **Conference items.** D11 says "news and event items", but events are built in M5.
2. **How much text to copy** while permission (O4) is still open.
3. **Who picks the pages.**
4. **A new library** for reading HTML in the importer (development tool only).

Answers are recorded in §11.

## 10. Risks

| Risk                                                   | Mitigation                                                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Content rights belong to IMA; permission not yet given | Small sample, clear attribution and links, the removal switch, and O4 stays open before the pitch             |
| The site signals it doesn't want AI crawling           | A hand-picked list, one fetch per page, `robots.txt` obeyed, no crawling; raise it when asking for permission |
| The site's HTML changes and extraction breaks          | Fixtures are committed, so the demo never depends on the live site; the importer is only run by hand          |
| Personal data slipping in through article text         | The personal-data check and the owner's review of the fixtures                                                |
| Imported guideline details being wrong or out of date  | Only what the page shows is stored, with its link; nothing is inferred                                        |

## 11. Owner answers (2026-10-01)

1. **Conference items:** M4 fetches a few conference pages into fixtures and commits them. They are **loaded only in M5**, when events exist. Nothing is shown as news in the meantime.
2. **Text copied:** each news item keeps its **title, date, a short excerpt (about 300 characters) and a link** to the full text on the IUA website. The full text is not copied. This can be widened once permission (O4) is given.
3. **Page list:** Claude reads the news list and the guideline pages once and **proposes a list of addresses in the pull request. Nothing is fetched into fixtures until the owner approves the list.**
4. **HTML library:** **cheerio**, as a development dependency of the importer only, under the supply-chain rules (7-day release age, audit).
