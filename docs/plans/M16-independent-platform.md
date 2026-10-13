# M16: an independent platform, with a section for the association

**Status: approved by the owner on 2026-10-13, with the answers in §11. The name is still to be chosen (it is needed at step 8).**

Asked for by the owner on 2026-10-13: "i want to build the app as independent from the association but make a subsection for the association", and "for now we continue the build without a server".

Track: Independence. Size: XL (it touches most of the server, the site and the app). Needs first: the owner's answers in §9, above all the product's new name.

## 1. What I checked before writing this

- **The whole product is built as if it were the association.** There is no notion of "an organisation" anywhere: 85 database tables, none of them says whose it is. News, events, rooms, messages to members, membership, the card, the staff roles: each exists once, and that once means "the association's".
- **"Member" does two jobs.** It means "a person the association accepted", and it is also the key that opens the product: chat, the directory and members-only content all ask "has this person an active membership?". An independent product needs these apart: a person may use the platform without belonging to the association.
- **Who may see a piece of content has three settings:** everyone, members, selected membership types. "Members" means the association's.
- **The association is named in the texts about 92 times in English and 97 in Hebrew,** across 14 text files in each language. Some mean the organisation ("the association's staff will see this"), some mean the product ("IUA Connect").
- **The name is in the code too:** the app is called "IUA Connect" with the identifier `test.demo.iuaconnect`; the internal packages are named `@iua/...`; about 326 source files mention it.
- **The demo carries content taken from the association's website** (`tools/importer/sources.json`: pages of `urology.ima.org.il`), shown with its source. That was a sample for a pitch to the association. In a product that is not theirs, it is their content on someone else's platform.
- **The app and the site are the same in this respect:** both show one undivided product.

## 2. Goal and exit criteria

**Goal:** the product stands by itself, under its own name, for physicians who are verified as such. Inside it, an organisation has a section of its own. The association is the first organisation: its members, its membership card, its news, events, rooms and messages live in its section, run by its own staff.

**Exit criteria**

- A verified person who belongs to no organisation can use the platform: profile, the directory, private chat and groups, education, exam practice, guidelines, search.
- The association's section holds everything that is the association's, and its staff manage only that.
- A test with **two** organisations proves that neither's staff, members or content leak into the other's, on every route that has a scope.
- The association's name appears only where the association is meant. The product's name is the new one, everywhere, on the site and in the app.
- The demo's organisation is fictional. Nothing taken from the real association's website is in the demo.
- Everything that worked before still works: the existing suites pass, changed only where a test named the association.
- CI green, `PROJECT_STATUS.md` updated, a demo.

## 3. The model

**Three things that were one**

|                        | What it is                                                  | Who decides                                                                                                                                                                 |
| ---------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **An account**         | A person who signed up                                      | The person                                                                                                                                                                  |
| **A verified account** | A person known to be a physician                            | The platform (how: M17). In this milestone the state exists; the demo's people are seeded as verified; and whoever an organisation accepted as a member counts as verified. |
| **A membership**       | Belonging to an organisation, with a type, dates and a card | That organisation, by its own steps (today's application, the director, the office)                                                                                         |

**What belongs to the platform, and what to an organisation's section** (proposed; question 3)

| The platform, for every verified person                 | An organisation's section, for its members            |
| ------------------------------------------------------- | ----------------------------------------------------- |
| The account, sign-in, security                          | Membership: types, applications, approval, history    |
| The profile and who may see each field                  | The membership card and its verification page         |
| The directory of people who chose to be listed          | The organisation's news                               |
| Private chat and groups                                 | The organisation's events, registration, attendance   |
| Rooms opened by the platform                            | The organisation's rooms                              |
| The education library and exam practice                 | Messages from the organisation to its members         |
| Guidelines (links to their publishers)                  | The organisation's own education items, if it has any |
| Search, notifications, settings                         | Its staff's admin area                                |
| Platform news and events, if the operator publishes any |                                                       |

**Who may see a piece of content: four settings instead of three**

Everyone · verified people · members of the organisation that published it · selected membership types of that organisation.

**Staff**

- **Platform staff** run the platform: accounts, verification, platform content, reports from platform rooms, settings.
- **An organisation's staff** hold the same kinds of role as today (editor, events, membership office, moderator), but only inside their organisation.
- A person can be both.

**One organisation now, more later**

The data and the rules are built for any number of organisations, and tested with two. The screens are built for the case that exists: one. A second organisation is then new data and a small admin screen, not a rebuild. Letting organisations sign themselves up is not in this milestone.

## 4. Scope

**In**

1. **The database:** an `organisations` table; everything that is an organisation's gains the organisation it belongs to (membership types, memberships, applications, news, events, rooms, room categories, broadcasts, the education items an organisation owns, staff roles). One migration moves all existing rows to organisation number one. Additions and one backfill; no data is lost.
2. **The server:** every route that reads or changes an organisation's things checks the organisation. The "active member" key that opens the platform is replaced by "verified"; "member of this organisation" opens that organisation's section. The four viewing settings.
3. **The site:** the platform's own navigation, and an organisation's section with its page (about it, membership, card, its news, events and rooms). News and events lists show what the person may see from the platform and from their organisations, each marked with whose it is. The admin area in two scopes: the platform's and an organisation's.
4. **The app:** the same division. The card, the application and the organisation's rooms move under the organisation's section; the tabs stay five.
5. **The new name,** on the site, in the app (its name, identifier and icon text), in emails, in the accessibility statement and the documents. Each of the roughly 190 mentions in the texts is read and decided: the organisation, or the product.
6. **The demo:** a fictional organisation ("a urological society", clearly marked as fictional) with fictional news and events. The content imported from the real association's website leaves the demo's seed. The importer tool stays in the repository, unused.
7. **Documents:** a decision record ("a platform with organisations"), and `PRODUCT_REQUIREMENTS.md`, `ARCHITECTURE.md`, `SECURITY_MODEL.md`, `DATABASE_DESIGN.md` and `API_DESIGN.md` brought in line. The original specification is kept as it was, marked as history.

**Not in**

| Item                                                                     | Where                                                                  |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| How a person is verified as a physician                                  | M17                                                                    |
| A public face for the product, invitations, first steps for a new person | M17                                                                    |
| A second real organisation, and organisations signing themselves up      | Later; the model allows it                                             |
| The real association in the product: its name, logo, content             | Only with its written agreement (§5)                                   |
| A server on the internet                                                 | Deferred by the owner; M18                                             |
| Who operates the product in law (a person, a company)                    | The owner's decision, outside the code; needed before real users (M20) |
| Fees, subscriptions                                                      | M29                                                                    |

## 5. Rules

- **The real association appears only with its agreement.** Its name, its logo and anything copied from its website are used in this product only after it agrees in writing. Until then the organisation in the demo is fictional. This protects the owner as much as the association.
- **An organisation sees only its own.** Its staff see its members and its applicants, and nobody else on the platform. A person who never applied to it does not exist for it.
- **Leaving an organisation does not close the account.** The person keeps the platform; the membership ends; the card stops verifying.
- **Platform staff and an organisation's data.** Proposed: platform staff do not read an organisation's membership files (applications, licence numbers, history) in the normal course. Reading one is a named permission, used for support, and written to the audit log. Question 5.
- **What an organisation publishes says so.** Its news, events and messages carry its name; nothing of an organisation's is shown as if the platform said it.
- **The scope is checked on the server, on every route.** A screen that hides a button is not a check.
- **Nothing about a person's memberships is shown to others** unless the person shows it (the directory already lets each field be hidden; "member of" becomes one such field).

## 6. New libraries and tools

None expected.

## 7. Tests

- **Two organisations in the test data,** though the demo shows one. For every scoped route: staff of A get "not found" for B's things; a member of A does not see B's members-only content; a person in neither sees neither.
- **The four viewing settings,** as a table of who sees what, for news, events and education.
- **The migration:** run on a copy of the demo database; counts before and after match; every old row belongs to organisation one.
- **A verified person without a membership** can do everything in the left column of §3 and nothing in the right one.
- **Texts:** a check that the old product name no longer appears in any text file, and that the association's name appears only in the fictional organisation's data.
- **The app's screen tests** updated for the new division; the browser tests updated where they named the association.
- The existing suites, green.

## 8. Order of work (a commit at each step; tests green at each)

1. This plan approved, with the answers of §9.
2. The data model and the migration; the two-organisation test data.
3. The server: scopes on every route, with the tests of §7.
4. "Verified" as the platform's key; the four viewing settings.
5. Staff roles in two scopes; the admin area's two views.
6. The site: navigation, the organisation's section, the marked lists.
7. The app: the same.
8. The new name; the texts, one by one, in both languages.
9. The demo: the fictional organisation; the imported content removed.
10. Documents, the decision record, `PROJECT_STATUS.md`, demo.

**Git:** two pull requests. First the server and data (steps 2 to 5), which changes nothing a user sees. Then the site, the app, the name and the demo (6 to 10).

## 9. Questions for the owner

1. **The product's new name,** in Hebrew and in English. It is needed before step 8, and I can propose a few if you like. It must not contain the association's name or initials.
2. **Who is it for?** Urologists in Israel only, or physicians more widely? It decides the lists the product is built around (subspecialties, hospitals) and many texts. (Proposed: urologists in Israel now; the lists are data and can grow.)
3. **The division of §3:** is that the right split between the platform and the association's section? In particular: are education and exam practice the platform's, or the association's?
4. **Has the association agreed to have a section,** with its name? If not yet, the demo's organisation is fictional (§5). Agreed?
5. **May platform staff read an organisation's membership files?** (Proposed: only with a named permission, logged.)
6. **The internal package names** (`@iua/...`): rename them too? Nobody but developers sees them. (Proposed: yes, in one mechanical commit, so the old name is gone from the code.)
7. **Who operates the product** (you, a company)? The texts that name the operator (terms, the accessibility statement, emails) need it. For the demo a placeholder marked as such will do.

## 10. Risks

| Risk                                                                            | What is done about it                                                                                                                                     |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A scope is forgotten on one route, and one organisation's data shows to another | Two organisations in the tests, and a test that lists every route and fails for one without a declared scope, as the project already does for permissions |
| Changing the key from "member" to "verified" opens something it should not      | The table of who sees what is written first and tested line by line; nothing is opened to unverified accounts that was closed before                      |
| The migration damages the demo data                                             | Additions and a backfill only; tried on a copy; the demo can always be rebuilt from its seed                                                              |
| The association objects to being a "section" of someone else's product          | It appears only if it agrees; without it the platform is whole and the section is a fictional example                                                     |
| The owner holds a role in the association                                       | Said to the association before anything is shown; not a matter for the code                                                                               |
| It grows into "software for any organisation" before one organisation uses it   | Screens for one organisation only; self-service is explicitly out                                                                                         |
| Renaming everything breaks links, tests and the installed .apk                  | One commit for the mechanical rename; the .apk is rebuilt; old demo links are not kept                                                                    |
| The milestone is the largest change to existing code so far                     | Two pull requests; the first changes nothing visible and is protected by the existing suites                                                              |

## 11. Owner answers

Given on 2026-10-13: "1.you propose pleae 2.make it for urologists in israel for now with the option to include more spichealtys 3.the platform's 4.yes 5.like you proposed 6.yes 7.me for now". With the seven answered, the plan is approved.

1. **The name: Claude proposes, the owner chooses.** Proposed the same day: Collega (קולגה), Urolink (אורולינק), MedKesher (מדקשר), Tzevet (צוות). None was checked for a trademark or a free web address; that is done before one is used in public. Steps 2 to 7 do not need the name.
2. **For urologists in Israel now, built so that other specialties can be added.** So: a specialty is data, not something written into the code or the texts. The product starts with one specialty, urology, and its subspecialties.
3. **The division of §3 stands, and education and exam practice are the platform's.**
4. **"Yes".** Taken as: agreed that the demo's organisation is fictional until the association agrees in writing. **This is Claude's reading;** if the owner meant that the association has already agreed, the owner says so, and its agreement in writing is what §5 asks for.
5. **Platform staff read an organisation's membership files only with a named permission, and it is logged.**
6. **The internal package names are renamed too.**
7. **The owner operates the product for now,** as a person. The texts that name the operator say so with a placeholder until the owner gives the wording.
