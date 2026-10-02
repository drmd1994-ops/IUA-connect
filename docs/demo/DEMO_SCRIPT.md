# IUA Connect — demo script

A walk-through for a pitch, in the order an audience follows most easily: a visitor, a member, an application being approved, then the association's own tools. About 15 minutes. A 5-minute version is at the end.

Every person and every item in the demo is fictional. Say so at the start; the yellow strip at the top of each page says it too.

This script was walked through, step by step, on a freshly reset database on 2026-10-02.

## Before you start (10 minutes, once per pitch)

1. **Reset the demo**, so it starts from the same state every time. Stop the servers first.

   ```powershell
   pnpm demo:reset
   ```

   It asks you to type the database name (`iua_connect`) before it deletes anything.

2. **The first time only:** the reset ends by naming a picture file (`outbox\demo-authenticator.svg`) and a setup key. Add one of them to an authenticator app on your phone (Google Authenticator, Microsoft Authenticator). That single entry gives the six-digit code for **every** staff demo account, and it stays the same after every reset.

3. **Start the demo** and wait until both lines say they are ready:

   ```powershell
   pnpm dev
   ```

4. Open **http://localhost:3001** in Chrome or Edge. Use a normal window for the member and a private window for staff, so two people can be signed in at once.

5. Check: the home page is in Hebrew, right to left; the footer shows the association's (fictional) contact details.

**Accounts.** All use the password `olive-grove-demo-2026`. Staff accounts then ask for the code from your authenticator ("קוד אימות").

| Who                 | Account                        | Code needed |
| ------------------- | ------------------------------ | ----------- |
| Member              | `member.full@demo.test`        | no          |
| Applicant           | `applicant.director@demo.test` | no          |
| Department director | `director.rambam@demo.test`    | yes         |
| Association admin   | `admin@demo.test`              | yes         |
| Event admin         | `events@demo.test`             | yes         |
| Super admin         | `super@demo.test`              | yes         |

A code works once. If you sign in to two staff accounts in a row, wait for the code to change (up to 30 seconds).

## The script

### 1. A visitor (2 minutes)

Not signed in.

| Do                                                                       | The audience sees                                        | Say                                                                              |
| ------------------------------------------------------------------------ | -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Open the home page. Switch to English with the language link, then back. | The whole page turns left to right and back.             | "Hebrew first, English beside it. Arabic and Russian can be added the same way." |
| **חדשות** → open "נפתחה ההרשמה לכנס השנתי (הדגמה)".                      | A news article.                                          | "News goes through an editor and a reviewer before anyone sees it."              |
| **אירועים** → "הכנס השנתי לדוגמה (הדגמה)".                               | Date, place, and a programme with sessions and speakers. | "Events with a programme, registration and a calendar file."                     |
| **הדרכה** → "קורס לדוגמה בארבעה שיעורים (הדגמה)".                        | Four lessons; the fourth says "לחברים" and has no title. | "Some content is for members. A visitor sees that it exists, not what it is."    |
| In the search field at the top, type **בכנס** and search.                | The article whose title says "לכנס" is found.            | "Search understands Hebrew prefixes, vowel marks and final letters."             |

### 2. A member (4 minutes)

Sign in as `member.full@demo.test`.

| Do                                                                   | The audience sees                                                                                   | Say                                                                                               |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| You land on the home page.                                           | A personal dashboard: "חברות מלאה: פעילה עד…", new notifications, upcoming events, news, education. | "After sign-in the home page is the member's own."                                                |
| Point at "מתוכנן להמשך".                                             | Four greyed actions marked "בקרוב".                                                                 | "What is planned is shown as planned. Nothing pretends to work."                                  |
| Click the bell.                                                      | The notification list, newest first.                                                                | "One place for everything that concerns the member."                                              |
| **בחירה מה לקבל**.                                                   | A table: each kind of content, with a switch for the site and one for email.                        | "Each member decides what reaches them, and where. Email about new content is one summary a day." |
| Account menu → **כרטיס חבר**.                                        | A membership card with a QR code that changes every few minutes.                                    | "The code holds no personal data. Scanning it shows only: valid, name, type."                     |
| Account menu → **לוח הזמנים שלי**.                                   | The member's events; two chosen sessions of the annual meeting overlap and are flagged.             | "A personal schedule, with a warning when two sessions clash."                                    |
| Account menu → **מדריך החברים** → search **גולן** → open the result. | One member: her name and title. Nothing else, because she chose to show nothing else.               | "The directory is opt-in, for members only, and each member chooses every field shown."           |

### 3. An application is approved (3 minutes)

The heart of the membership process: the department director confirms, then the association approves.

| Do                                                                            | The audience sees                                                            | Say                                                                               |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Private window: sign in as `director.rambam@demo.test` (with the code).       |                                                                              | "Staff accounts need a second step. Always."                                      |
| Account menu → **בקשות לבדיקה** → on "Tamar Levin" press **אישור**.           | "הבקשה אושרה."                                                               | "The director confirms that the applicant works in the department. Nothing more." |
| Sign out. Sign in as `admin@demo.test` (wait for a new code).                 | The admin area opens on **לוח בקרה**: what is waiting, as numbers.           | "The association sees at a glance what needs it."                                 |
| On the tile "בקשות חברות" follow the link → on "Tamar Levin" press **אישור**. | "הבקשה אושרה."                                                               | "Two approvals, both recorded with who and when."                                 |
| First window: sign out, sign in as `applicant.director@demo.test`.            | The dashboard shows an active membership; the bell shows "החברות שלך אושרה". | "She is told in the site and by email, and her card works from this moment."      |

### 4. Content is reviewed (2 minutes)

As `admin@demo.test`.

| Do                                                         | The audience sees                                                            | Say                                                                                      |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **חדשות**: one item is waiting. Open it → **פרסום עכשיו**. | The state becomes "פורסם".                                                   | "The editor wrote it; a second person publishes it. The editor can't publish their own." |
| **הדרכה** → **שאלות מבחן**.                                | Ten urology questions, all "ממתין לבדיקה".                                   | "Exam questions are written, then checked by a urologist before any member sees them."   |
| Open one.                                                  | The question, four answers, an explanation for each, a summary of the topic. | "After answering, the member sees why each answer is right or wrong."                    |

Publish a question here only if you have reviewed it yourself. To show the member's side, publish one you approved, then open **הדרכה → תרגול שאלות מבחן** as the member.

### 5. A message to all members (1½ minutes)

As `admin@demo.test`.

| Do                                                                  | The audience sees                                                           | Say                                                                                 |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **הודעות**: "הזמנה למפגש החברים השנתי (הדגמה)" is waiting. Open it. | The text, who wrote it (another admin), and how many people it would reach. | "Nobody can message every member alone. A second admin must approve."               |
| **אישור ושליחה**.                                                   | The state becomes "נשלחה".                                                  | "Sent in the site at once; emails follow within a minute, to those who want email." |
| Member window: the bell → open the message.                         | The message, in Hebrew.                                                     |                                                                                     |

### 6. An event at the venue (1 minute)

Sign in as `events@demo.test` (new code).

| Do                                | The audience sees                     | Say                                                                                             |
| --------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **אירועים** → the annual meeting. | Programme, registrations, attendance. |                                                                                                 |
| **הצגת קוד הנוכחות**.             | A QR code that renews itself.         | "At the door, members scan this with their own phone. The code is useless a few minutes later." |

### 7. Control and accountability (1½ minutes)

Sign in as `super@demo.test` (new code).

| Do                                                                                   | The audience sees                                         | Say                                                                         |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------- |
| **חשבונות** → search `applicant.rejected` → open → type a reason → **השבתת החשבון**. | The state becomes "מושבת".                                | "An account can be closed in one step. A reason is always required."        |
| **החשבון הזה ביומן הביקורת**.                                                        | The action, who did it, when, from where, and the reason. | "Everything that matters is recorded, and nobody can change the record."    |
| **הגדרות** → tick **הצגת ההודעה** → **שמירה**. Then open the home page.              | A notice across the top of every page.                    | "The association can tell everyone something at once, without a developer." |

## The 5-minute version

1. **Visitor:** home page in Hebrew, switch to English and back; search **בכנס** (step 1, first and last rows).
2. **Member:** the dashboard and the membership card (step 2, rows 1 and 5).
3. **Approval:** the director and the admin approve Tamar Levin (step 3).
4. **A message to members** approved by a second admin (step 5).

## If something goes wrong

| What you see                                                | What to do                                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| "The code is wrong" at a staff sign-in                      | Wait for the next code. A code works once, and the phone's clock must be right.                  |
| A staff account is taken to "אבטחת החשבון" to add a passkey | The reset's last step didn't run. Run `pnpm demo:reset --two-step-only` (it deletes nothing).    |
| An account is locked after wrong passwords                  | As `admin@demo.test`: **חשבונות** → the account → **ביטול הנעילה**. Or run `pnpm demo:reset`.    |
| A page keeps saying "טוען…"                                 | The API isn't running. Look at the `pnpm dev` window; start it again.                            |
| `pnpm demo:reset` says something is still connected         | Stop `pnpm dev` (Ctrl+C) and close any database tool, then run it again.                         |
| "Tamar Levin" isn't in the director's list                  | The step was already done since the last reset. Run `pnpm demo:reset`.                           |
| You want to show an email                                   | Emails are written as files to the `outbox` folder. Open the newest `.html` file in the browser. |
| The daily summary email                                     | It is sent in the morning. To produce it now: `pnpm job:run notifications.content-digest`.       |

## What not to promise

See [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md). In short: this is a demo on one computer with fictional data. There is no payment, no CME tracking, no mobile app yet, and nothing has been through a legal or security review for real members' data.
