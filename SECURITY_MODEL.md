# IUA Connect — Security Model

> Technical controls are not compliance (spec §59). A professional legal and privacy review is **required before any real personal data** is loaded. Until then the system runs in **demo mode with fictional people**.

## 1. What we protect

| Asset                                   | Why it matters                                                                                           |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Member identities and professional data | Personal data under Israeli privacy law. A list of all urologists is valuable to spammers and marketers. |
| Specialist certificate numbers          | Identifying professional credential                                                                      |
| Admin and director accounts             | Can approve members, publish content, and message every member                                           |
| Content integrity                       | Members rely on IUA content being authentic                                                              |
| Audit trail                             | Evidence of who did what                                                                                 |
| Private messages between members (M11)  | Correspondence between doctors. Sensitive in itself, and the place where a patient's details could be typed against the rules. |
| (Later) patient-adjacent content        | Cases, logbook. The highest sensitivity; out of the MVP. Chat between doctors and patients is not planned. |

## 2. Threat model (MVP, STRIDE summary)

| Threat                                          | Example                                                                   | Primary controls                                                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Spoofing                                        | Credential stuffing; a fake physician registers                           | Argon2id; lockout and rate limits; breached-password check; MFA; director + admin approval chain; email verification     |
| Tampering                                       | Editing another user's profile; changing a membership via mass assignment | Server-side permission guard + resource policies; Zod allow-listed DTOs; ETag concurrency; audit                         |
| Repudiation                                     | Admin denies approving a member                                           | Append-only audit log (database-enforced); decisions store the actor and reason                                          |
| Information disclosure                          | Directory scraping; IDOR on `/members/{id}`; leaked tokens in logs        | Opt-in directory; per-field visibility; rate limits; 404-for-hidden; log redaction; no personal data in QR codes or JWTs |
| Denial of service                               | Login floods; huge uploads                                                | Rate limits; upload size caps; pagination caps; timeouts                                                                 |
| Elevation of privilege                          | Member calls `/admin/*`; director approves outside their department       | Permission guard on every route (deny by default); scoped roles; admin requires `mfa=true`; tests for every admin route  |
| **Admin account takeover → phishing broadcast** | Attacker messages all members                                             | Mandatory MFA for admins; two-admin approval for broadcasts; new-device alerts; short admin sessions                     |

| **Reading someone else's conversation**         | Changing a conversation or message id in a request; listening to the event stream | Every chat route finds the caller's own membership of the conversation first; anything else is 404, tested per route; stream events carry ids only |
| **Staff reading private messages**              | An administrator browses conversations                                    | No such route exists. A report carries the reported message and five on each side; each look is audited                  |
| **Harassment or spam in chat**                  | Unwanted messages; mass first contact                                     | Only listed members can be written to, and each can choose "nobody"; blocking; per-person limits; reports; suspension    |

## 3. Controls by area

### Authentication and sessions

- Argon2id (`m=19456 KiB, t=2, p=1` minimum, tuned on the target host). Passwords of 12+ characters, checked against a bundled breached-password list.
- Access JWTs: EdDSA, 10 minutes. Refresh tokens: opaque, random 256-bit, stored hashed, rotated on every use. **Reuse detection revokes the whole family.** One exception, since 2026-10-05: a token used less than 10 seconds ago is accepted once more if the token that replaced it was never used. That is a renewal whose answer never reached the browser (the page was reloaded while it was on its way). The lost token is used up at that moment, the event is audited (`auth.refresh.lost_answer`), and any later use of either old token still ends the session.
- Refresh cookie: `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth/refresh`, plus a CSRF double-submit header.
- MFA: TOTP (RFC 6238) with encrypted secrets and hashed single-use recovery codes. Mandatory for DEPARTMENT_DIRECTOR and every admin role. Passkeys in M1b.
- Re-authentication required for sensitive changes (email, password, MFA, roles).
- Account enumeration prevented on register, login and password-reset responses (uniform responses and timing).
- New-device login sends an email notification. Sessions are visible and revocable by the user.

### Authorization

- **Deny by default:** every controller route must declare `@Public()` or `@RequirePermission(...)`. A unit test fails the build if any route declares neither.
- Resource policies (e.g. `canDecideVerification(user, request)`) live in services and are unit-tested.
- The frontend hides what the user can't do, but **never enforces** it.

### Input and output

- Zod validation on every input; unknown keys are rejected.
- Prisma parameterized queries. Raw SQL is only allowed in reviewed repository files using `Prisma.sql`.
- Rich text is sanitized server-side (allow-list) on write and rendered without `dangerouslySetInnerHTML` except for sanitized content.
- Security headers: strict CSP (nonce-based), HSTS, `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and `frame-ancestors 'none'`. One exception in the CSP: inline styles are allowed (`style-src 'unsafe-inline'`), because the interface components set style attributes that can't carry a nonce; scripts are nonce-only. A passive OWASP ZAP scan runs in CI; what it found and what was accepted is in `docs/security/ZAP_BASELINE.md`.

### Files

- Allow-list: PDF, PPT/PPTX, DOC/DOCX, JPEG, PNG, MP4, MP3. **SVG and HTML are blocked.**
- MIME detected from content (magic bytes), not from the extension or client header. Size limit per type.
- Images are re-encoded and **all metadata (EXIF, GPS) is stripped**.
- Stored outside the web root under random keys. Downloads only through short-lived signed URLs after an access check. `Content-Disposition: attachment` for documents.
- `scan_status` is tracked. In demo mode uploads are admin-only and marked UNSCANNED. The app **refuses to start in production with the no-op scanner**.

### Chat (M11)

- **Who may read:** only the two people of a conversation. The service looks up the caller's membership of the conversation on every route; a conversation or message the caller has no part in answers "not found", like one that never existed. Administrators have no way in.
- **Who may write to whom:** an active member, to a member listed in the directory who has not chosen "nobody". Not listed, not active, "nobody" and blocked all look like nobody.
- **Text is plain text.** No HTML and no Markdown; the page shows it as text, so nothing typed can run in another person's browser. Web addresses become links with `rel="noopener noreferrer nofollow"`.
- **Blocking** stops messages in both directions; the blocked person gets a neutral refusal and is not told.
- **Reports and staff:** `chat.moderate` (IUA admins, in a session with two-step verification). A report keeps the reported message and the five before and after it; staff see nothing else of the conversation. Nobody decides on a report they are part of. Every look and every decision is in the audit log, without message text. The kept copy is erased 90 days after the report is closed.
- **The event stream** is authenticated like every route, carries ids only, ends after ten minutes (the life of an access token) and is limited to three per person.
- **Email and push** about messages never carry the text or the sender.
- **Not protected:** messages are **not end-to-end encrypted**; whoever can read the database can read them. Nothing technical stops a person from typing a patient's details: there is a standing note, a report reason, and staff can delete. This needs the legal review before real use.

### Chat rooms (M12)

- **Who may see rooms:** members with an active membership, and staff with `chat.moderate`. Anyone else gets "not found" from every room route.
- **Who may read a room:** the people in it, and staff with `chat.moderate`. A member who has not joined sees the room's name, description and number of members, not its messages, its people or its pins. Someone removed or banned is outside from that moment: their open page stops receiving and empties itself.
- **Joining shows your name.** The people in a room see the first and last name of everyone in it, also of members not listed in the directory. The member is told before the first join, and can't join without a name.
- **Who may write:** a person in the room with an active membership, not suspended from chat; in an announcements room or a locked room, moderators only. Someone whose membership ended keeps reading the rooms they are in and can't write.
- **Who may moderate:** the room's own moderators while their membership is active, and staff with `chat.moderate`. A moderator has no power in another room, and can't remove, ban or delete the message of another moderator; staff can. Every moderation action is in the audit log with its reason, without message text.
- **Who opens rooms:** staff with `chat.rooms.manage` (IUA admins, in a session with two-step verification). They open, change, archive and restore rooms, appoint moderators (active members only), and keep the categories and the report reasons.
- **Staff in rooms, not in private chat.** Staff with `chat.moderate` can read any room. Private conversations stay closed to them, as in M11.
- **Mentions** are checked on the server: only people in the room, ten a message. A mention is a notice under the bell; no email unless the person switched room emails on, and then without the text or the sender.
- **Blocking in a room:** a blocked person's messages are folded for the person who blocked them, and cause no notice. They are not hidden from the room.
- **Not protected:** as for private chat, nothing is end-to-end encrypted, and nothing technical stops a person typing a patient's details into a room that many people read. The standing note, the report reason, the moderators and the staff are the only protection. This needs the legal review before real use.

### Secrets and cryptography

- No secrets in the repo. `.env` is git-ignored, and `.env.example` holds placeholders only. Secret scanning (gitleaks) runs in CI and as a pre-commit hook.
- Field encryption uses AES-256-GCM with a key from env (a KMS or secret manager in staging and production). Key ID stored with the ciphertext for rotation.
- TLS everywhere outside localhost.

### Logging and audit (spec §46)

- pino structured logs with a redaction list: `password`, `token`, `authorization`, `cookie`, `mfa*`, `specialist_certificate*`, `*.body` on auth routes.
- Never logged: passwords, tokens, certificate numbers, patient information, payment data.
- The audit log is append-only: the database role lacks UPDATE/DELETE and a trigger blocks both. Audit entries hold redacted diffs.

### Privacy by design

- Data minimization: only the fields in spec §6; nothing collected "just in case".
- Directory opt-in, fields default to PRIVATE, and explicit versioned consents.
- Analytics (later) are privacy-first, with no third-party trackers.
- Export and delete own data: planned (right-of-access requests).
- Imported IUA website content contains **no personal data beyond author bylines**, and the physician directory is excluded (D11).

## 4. Regulatory notes (for legal review, not conclusions)

- Israeli Privacy Protection Law, including **Amendment 13** (in force August 2025), and the **Privacy Protection (Data Security) Regulations 2017**. The member database probably requires a defined security level, a database definition document, access control, periodic risk assessment, incident-handling procedures, and possibly a DPO.
- Accessibility: Equal Rights for Persons with Disabilities regulations / **IS 5568** (based on WCAG).
- Copyright: content from urology.ima.org.il belongs to IMA according to its footer. Permission is recommended before showing it in the pitch (open item O4).
- Future phases: medical-device classification for calculators and AI (spec §15, §30); e-voting validity under the association's bylaws (spec §29).

## 5. Security testing

| Layer        | Tooling                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------- |
| Static       | ESLint security rules, TypeScript strict, Semgrep (CI)                                             |
| Dependencies | `pnpm audit`, Dependabot/Renovate, lockfile committed                                              |
| Secrets      | gitleaks (pre-commit + CI)                                                                         |
| Unit         | Policies, guards, token rotation and reuse detection, lockout                                      |
| Integration  | Every admin endpoint tested as anonymous → 401, member → 403, admin without MFA → 403, admin → 2xx |
| E2E          | Playwright: registration → director approval → admin approval → card                               |
| Dynamic      | OWASP ZAP baseline against staging (M9)                                                            |
| External     | Penetration test before any real data (M9)                                                         |

## 6. Incident response (initial)

1. Detect: auth-failure spikes, refresh-token reuse events and admin-action anomalies are logged as security events.
2. Contain: revoke all sessions (per user or global), rotate the JWT signing key and field-encryption key version, disable an account.
3. Assess and notify: follow the obligations identified in legal review (the Privacy Protection Authority's notification rules).
4. Postmortem in `docs/security/incidents/`.
