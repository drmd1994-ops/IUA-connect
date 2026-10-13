# M17: verifying physicians, and a new person's first steps

**Status: proposed on 2026-10-13. Not approved. Nothing of it is built.** This is the plan at the depth that can be written today. When its turn comes, §1 is done against the code as it then stands and the plan is confirmed again before any code.

Track: Independence. Size: L. Needs first: M16. A decision on who checks, and against what.

## 1. Goal

A physician who has never heard of the product can find it, sign up, be confirmed as a physician, and reach colleagues, without belonging to any organisation.

**Why:** until now the association vouched for everyone. An independent product has to know by itself that the person writing in a professional chat, or reading a case, is a physician.

## 2. Scope

**In**

- **Verification.** A person gives their licence number and, for specialists, their specialist certificate; a reviewer confirms it. The states: not asked, waiting, verified, refused, expired. A refusal carries a reason and can be answered.
- **How it is checked** (question 1): by a person on the platform's staff looking the licence up in the Ministry of Health's public register; or automatically, if that register's terms allow it; or by an organisation vouching for its members (already in M16).
- **What an unverified account can do:** read what is open to everyone, fill in the profile, ask to be verified. Nothing else.
- **A public face:** what the product is, who is behind it, how data is treated, how to sign up. Today a visitor sees a sign-in page.
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

**Data:** verification requests and decisions for the platform (shaped like today's applications, which stay for organisations); invitations.

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

1. Who checks a new physician: the platform's own staff by hand, an automatic look-up if allowed, or both?
2. Physicians licensed in Israel only, or other countries too? (Each country is another register.)
3. Residents and medical students: are they in, and how are they verified?
4. Who are the platform's first reviewers?

## 10. Owner answers

None yet.
