# OWASP ZAP baseline scan

## What it is

On every change, CI starts production builds of the site and the API and runs the OWASP ZAP **baseline** scan against both (job `zap` in `.github/workflows/ci.yml`). ZAP follows the links it finds and reads the responses: headers, cookies, leaked information. It is **passive**: it sends no attacks and signs in nowhere, so it sees only what a visitor who is not signed in sees.

It is not a penetration test. Nobody has tried to break in (see `docs/demo/KNOWN_LIMITATIONS.md`).

## How it is judged

A rule that warns **fails the build**, unless it is listed in `.zap/rules.tsv` with a reason. The reasons are explained here. A new warning therefore can't slip in unnoticed; it has to be fixed or written down.

## First run (2 October 2026)

The site: 52 addresses, 60 rules passed, 7 warned, none failed.

### Fixed

| Rule              | What ZAP saw                                                                                                                                 | What was done                                                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10038 CSP not set | The "not found" page for `/robots.txt` and `/sitemap.xml` had no Content-Security-Policy. Addresses that look like files skipped the policy. | These addresses now get a fixed policy (`apps/web/next.config.ts`). Real pages keep the per-request policy with a nonce. The rule stays on, and must pass. |

### Accepted

| Rule                                 | What ZAP saw                                     | Why it is accepted                                                                                                                                                                                                                                                                                        |
| ------------------------------------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10010 Cookie without HttpOnly        | The `NEXT_LOCALE` cookie can be read by scripts. | It holds only `he` or `en`. The cookie that keeps a person signed in (`iua_rt`) is HttpOnly, Secure and SameSite=Strict, and an integration test checks this (`apps/api/test/auth.int-spec.ts`). The CSRF cookie is readable by scripts on purpose: that is how the double-submit check works.            |
| 10019 Content-Type missing           | Redirects (`/` → `/he`) have no Content-Type.    | A redirect has no body to describe.                                                                                                                                                                                                                                                                       |
| 10049 Non-storable content           | Pages can't be kept by shared caches.            | Informational. Each page carries a fresh nonce, so it must not be cached and reused.                                                                                                                                                                                                                      |
| 10055 CSP: `style-src unsafe-inline` | The policy allows inline styles.                 | The framework and the interface components set inline style attributes, which can't carry a nonce. Scripts, the dangerous part, are allowed only with the per-request nonce. Removing this would mean replacing those components; it is a known trade-off, recorded since M0 (`apps/web/src/lib/csp.ts`). |
| 10109 Modern web application         | The site is built with scripts.                  | Informational; it tells the scanner how to crawl.                                                                                                                                                                                                                                                         |
| 90004 Cross-Origin-Embedder-Policy   | The header is missing.                           | It is needed only for features the site doesn't use (shared memory between scripts). Turning it on would block pictures and video embedded from other sites.                                                                                                                                              |

**One thing to know about accepting a rule:** ZAP can only switch a rule off as a whole. With 10010 off, the scan would not notice a new cookie that should be HttpOnly and isn't. The integration test above covers the cookies that matter today; a new cookie needs its own test.

## Second run, after the fixes (2 October 2026)

- **The site:** 51 addresses, 61 rules passed, the six accepted rules above, no warnings.
- **The API:** 7 addresses, 66 rules passed, one accepted rule, no warnings. The scan reaches little of the API, because it follows links and an API has none; the API's own rules (who may read what, rate limits, error format) are proven by the integration tests, not by this scan.

### The API's finding

| Rule                         | What ZAP saw                                                                               | What was done                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10049 Storable and cacheable | The API's answers carried no caching instruction, so a browser or a proxy could keep them. | **Fixed, although the rule was already on the accepted list for the site:** every API answer now says `Cache-Control: no-store`, because answers hold personal or members-only data and the same address answers differently for different people. The public reference lists (hospitals, membership types) still allow five minutes. A unit test checks the default. |

The rule stays on the accepted list for the site's pages, for the reason given above.

## Reading a run

Each run keeps its full reports for download: on GitHub, open the run → **Artifacts** → `zap-web` and `zap-api`.

## Third run, when CI ran again (19 October 2026)

CI had been paused since 13 October (GitHub billing). The first run after it found three new warnings on the site, from pages added in M16, M17 and M30.

### Fixed

| Rule                               | What ZAP saw                                                                                                   | What was done                                                                                                                                                                                                                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 10024 Sensitive information in URL | The sign-in and sign-up forms, submitted the browser's own way, put the email and the password in the address. | Every form that takes a password, a code or an email now says `method="post"`, so nothing typed goes in an address. And a submit button stays disabled until the page has loaded its scripts (`apps/web/src/components/ui/button.tsx`), so a person can't submit a form the browser's way. |

### Accepted

| Rule                                           | What ZAP saw                                                                                              | Why it is accepted                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10031 User controllable HTML element attribute | Submitting a calculator's form, ZAP found its own values (`female`, `polar`, …) in the page's attributes. | They are the form's own option values, in the page before anything is sent. The calculator pages read nothing from the request (M30: nothing typed leaves the device). Switching the rule off also hides a real reflection elsewhere; the site renders no request values into attributes today.                                                                                                                      |
| 10111 Authentication request identified        | The sign-in form.                                                                                         | Informational: ZAP noting where people sign in.                                                                                                                                                                                                                                                                                                                                                                      |
| 10202 Absence of anti-CSRF tokens              | Once the forms said `method="post"`, ZAP saw them without a hidden anti-forgery field.                    | The forms never post to the site: the submit button is disabled until the script has loaded, and the script sends the request to the API itself. The API is called with a bearer token in a header, which another site cannot make a browser send; the only request that relies on a cookie (renewing the session) also needs the CSRF header, and `apps/api/test/auth.int-spec.ts` proves it is refused without it. |
