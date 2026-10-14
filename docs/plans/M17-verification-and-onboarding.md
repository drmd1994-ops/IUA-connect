# M17: verifying physicians, and a new person's first steps

**Status: proposed on 2026-10-13; checked against the code on 2026-10-14 (§0). Not approved. Nothing of it is built.** It waits for the owner's answers in §9 and approval.

## 0. What I checked on 2026-10-14, after M16

- **"Verified" exists, but only one door leads to it.** `users.verified_at` (M16) is set in two places only: when an organisation accepts a membership application (`memberships.service.ts`) and when an organisation imports its members (`import.service.ts`). A person who belongs to no organisation cannot become verified at all. M17 adds the platform's own door.
- **What an unverified account may do is already decided in one place.** The rule is `common/access-policy.ts`, fed by `access.service.ts`; the directory, chat, notifications and messages to members already ask `verified`. So step 4 is mostly tests that prove it, not new rules.
- **Applications today are an organisation's** (`verification_requests`, with `organisation_id` NOT NULL, a membership type, and the director-then-office chain). The platform's verification is a different thing (no type, no director), so it gets its own small tables rather than a null organisation in these. The way a licence number is checked, encrypted and hashed (`membership/identifier.ts`) is reused as it is.
- **The licence number is checked for form only** (1 to 15 digits) and is never compared with any register (decisions D2/D3).
- **The public face is not a sign-in page, as §2 said.** A visitor already sees a home page with the open sections (news, events, education, guidelines, organisations). What is missing is a page on what the product is, who is behind it, how data is treated, and how to sign up as a physician.
- **Invitations exist only inside chat** (to a group or a room, `chat/invitations.service.ts`). An invitation to join the platform by email is new.
- **The Ministry of Health's register is public:** anyone may look up a licensed professional by name or licence number and see the specialty, the kind of licence and whether it is active or suspended ([gov.il](https://www.gov.il/en/service/licensed-medical-practitioners)). Whether a program may query it automatically is not stated there; that is step 2.
- **Nothing in M17 needs a new library.** Email goes through the existing mailer.

Track: Independence. Size: L. Needs first: M16. A decision on who checks, and against what.

## 1. Goal

A physician who has never heard of the product can find it, sign up, be confirmed as a physician, and reach colleagues, without belonging to any organisation.

**Why:** until now the association vouched for everyone. An independent product has to know by itself that the person writing in a professional chat, or reading a case, is a physician.

## 2. Scope

**In**

- **Verification.** A person gives their licence number and, for specialists, their specialist certificate; a reviewer confirms it. The states: not asked, waiting, verified, refused, expired. A refusal carries a reason and can be answered.
- **How it is checked** (question 1): by a person on the platform's staff looking the licence up in the Ministry of Health's public register; or automatically, if that register's terms allow it; or by an organisation vouching for its members (already in M16).
- **What an unverified account can do:** read what is open to everyone, fill in the profile, ask to be verified. Nothing else.
- **A public face:** what the product is, who is behind it, how data is treated, how to sign up as a physician. Today a visitor sees the open sections but no such page (§0).
- **First steps:** after verification, a short guided start (profile, directory choice, finding colleagues, the organisation's section if they belong to one).
- **Invitations:** a verified person can invite a colleague by email; the invitation does not verify anyone, it only brings them to the door.
- **Re-checking:** verification is looked at again after a set time, and can be withdrawn.
- On the site and in the app.

**Not in**

- Verifying anyone who is not a physician (nurses, students) unless question 3 asks for it.
- Identity documents (a passport, an identity card): a licence number checked against a register is the proposal; identity documents are far more sensitive to hold.
- Growth campaigns, advertising.

## 3. Rules

- **A licence number is kept as it is today:** encrypted, never shown again to anyone, compared only.
- **The reviewer sees what they need and no more,** and every decision is in the audit log with who made it.
- **Being verified says "this is a physician",** not "this person is good" and not "the platform recommends them". The texts say so.
- **An invitation carries no rights.**
- **A person can ask what is held about their verification, and have it deleted with their account.**

## 4. What is built

**Data:** `physician_verifications` (one open per person; the state, the licence number encrypted and hashed as today, the specialist certificate if given, when it expires) and `physician_verification_decisions` (who, what, why, when), shaped like today's applications, which stay for organisations; `platform_invitations` (who invited, the address hashed, a one-use token, when it expires). Being verified still ends in `users.verified_at`, so everything built in M16 keeps working.

- Server: a `verification` module; the review queue for platform staff; the automatic look-up behind an interface, if allowed.
- Site and app: asking to be verified and following it; the public pages; the first steps; inviting.

## 5. New libraries, services and costs (each needs the owner's approval)

- None expected for the manual way.
- An automatic look-up depends on what the Ministry's register allows; this is found out at step 2 and brought to the owner before anything is built on it.

## 6. Tests

- Every state and every move between them; who may decide; a refused person cannot enter by another door.
- An unverified account is refused everywhere the table of M16 says so.
- The licence number never appears in an answer, a log or an error.
- An invitation used twice; an invitation to someone already there.

## 7. Order of work (a commit at each step; tests green at each)

1. Plan approved.
2. What the public register allows, found out and written down.
3. Requests, decisions, the review queue.
4. What an unverified account may do.
5. The public pages.
6. First steps and invitations.
7. Re-checking.
8. App.
9. Documents, status, demo.

## 8. Risks

| Risk                                                | What is done about it                                                                                                                  |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Someone is verified who is not a physician          | A human reviewer in the first version; the register is the source, not what the person claims; verification can be withdrawn           |
| Reviewing by hand does not keep up                  | The queue shows waiting time; organisations vouching for their members takes the bulk                                                  |
| The public register may not be used this way        | Found out first (step 2); the fallback is a reviewer reading it as any member of the public may                                        |
| A new product nobody is in gives no reason to join  | Open features first (guidelines, education open to all, later calculators); the association's section brings its members, if it agrees |
| Holding licence numbers makes the platform a target | They are encrypted and compared only, as today; the legal review (M20) covers it                                                       |

## 9. Questions for the owner

My recommendation, for the first version: **(1)** the platform's staff, by hand, against the public register; an automatic look-up only if step 2 finds it allowed, brought to you first. **(2)** Israel only. **(3)** residents in, verified by their licence number like anyone else; students out for now. **(4)** you, plus one person you name; in the demo, a fictional reviewer.

1. Who checks a new physician: the platform's own staff by hand, an automatic look-up if allowed, or both?
2. Physicians licensed in Israel only, or other countries too? (Each country is another register.)
3. Residents and medical students: are they in, and how are they verified?
4. Who are the platform's first reviewers?

## 10. Owner answers

None yet.
