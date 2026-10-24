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

**Accounts.** All use the password `ilikeIUAconnect11`. Staff accounts then ask for the code from your authenticator ("קוד אימות").

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

**Where the admin area is.** A staff account lands on the admin area straight after signing in; everyone else lands on their personal home page. From anywhere else, staff get back to it from the account menu (the email address at the top of the page) → **ניהול**. The sections named below (**חדשות**, **הדרכה**, **הודעות**, **אירועים**, **חשבונות**) are the menu of the admin area, not the site's main menu.

### 4. Content is reviewed (2 minutes)

As `admin@demo.test`.

| Do                                                         | The audience sees                                                            | Say                                                                                                            |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **חדשות**: one item is waiting. Open it → **פרסום עכשיו**. | The state becomes "פורסם".                                                   | "The editor wrote it; a second person publishes it. The editor can't publish their own."                       |
| **הדרכה** → **שאלות מבחן**.                                | Ten urology questions, all "פורסם".                                          | "Exam questions are written, then checked by a urologist before any member sees them. These ten were checked." |
| Open one.                                                  | The question, four answers, an explanation for each, a summary of the topic. | "After answering, the member sees why each answer is right or wrong."                                          |

The ten questions are loaded published, because the owner reviewed them. To show the member's side, open **הדרכה → תרגול שאלות מבחן** as the member. Publish a new question here only if you have reviewed it yourself.

### 5. A message to all members (1½ minutes)

As `admin@demo.test`.

| Do                                                                  | The audience sees                                                           | Say                                                                                 |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **הודעות**: "הזמנה למפגש החברים השנתי (הדגמה)" is waiting. Open it. | The text, who wrote it (another admin), and how many people it would reach. | "Nobody can message every member alone. A second admin must approve."               |
| **אישור ושליחה**.                                                   | The state becomes "נשלחה".                                                  | "Sent in the site at once; emails follow within a minute, to those who want email." |
| Member window: the bell → open the message.                         | The message, in Hebrew.                                                     |                                                                                     |

### 6. An event at the venue (1 minute)

Sign in as `events@demo.test` (new code). The admin area opens.

| Do                                | The audience sees                     | Say                                                                                             |
| --------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **אירועים** → the annual meeting. | Programme, registrations, attendance. |                                                                                                 |
| **הצגת קוד הנוכחות**.             | A QR code that renews itself.         | "At the door, members scan this with their own phone. The code is useless a few minutes later." |

### 7. Control and accountability (1½ minutes)

Sign in as `super@demo.test` (new code). The admin area opens.

| Do                                                                                   | The audience sees                                         | Say                                                                         |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------- |
| **חשבונות** → search `applicant.rejected` → open → type a reason → **השבתת החשבון**. | The state becomes "מושבת".                                | "An account can be closed in one step. A reason is always required."        |
| **החשבון הזה ביומן הביקורת**.                                                        | The action, who did it, when, from where, and the reason. | "Everything that matters is recorded, and nobody can change the record."    |
| **הגדרות** → tick **הצגת ההודעה** → **שמירה**. Then open the home page.              | A notice across the top of every page.                    | "The association can tell everyone something at once, without a developer." |

### 8. Chat between members (2 minutes, optional; added in M11)

Two windows: `member.full@demo.test` in the first, and in a private window `member.honorary@demo.test`. Neither needs a code.

| Do                                                                                   | The audience sees                                                                               | Say                                                                                                     |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| First window: **צ׳אט** in the top menu (it carries a number).                        | The member's conversations; one has unread messages, one is marked "מושתקת".                    | "Private messages between members. Only members who chose to be in the directory can be written to."    |
| Open the conversation with Ruth Golan.                                               | Messages in Hebrew and English, and above the message box: "אין לכתוב פרטים שמזהים מטופל."      | "It is for colleagues. Patient details don't belong here, and the page says so."                        |
| Second window: **Chat** → the conversation with Noa Bar-Lev → type a message, Enter. | In the first window: "Ruth Golan מקליד/ה…", then the message appears by itself.                 | "Messages arrive at once. Nobody refreshes anything."                                                   |
| First window: answer. Look at the ticks under your message.                          | One tick, then two, then two coloured ones when the other window shows it.                      | "Sent, delivered, read. Each member can switch 'read' off."                                             |
| First window: the three dots beside a message of hers → **דיווח** (don't send it).   | A short form: a reason, and what staff will see.                                                | "A member can report a message. Staff see that message and the five around it, never the conversation." |
| As `admin@demo.test`: **דיווחי צ׳אט** → open the waiting report.                     | The reported message, marked, with the one after it; the decision: dismiss, delete, or suspend. | "Staff can't browse conversations. Every look at a report is written to the audit log."                 |

The seed leaves one report waiting (a sample advertisement, between two other demo members). `pnpm demo:reset` puts everything back.

### 9. Chat rooms (closed in M25: skip; see step 12)

Communities replaced chat rooms in M25, and every room is archived. This step and the room rows of step 10 no longer apply; they are kept as a record.

The same two windows, with `member.resident@demo.test` in the private window this time. Noa Bar-Lev (`member.full`) is the moderator of three demo rooms.

| Do                                                                                         | The audience sees                                                                             | Say                                                                                           |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| First window: **צ׳אט** → **חדרים**.                                                        | The rooms Noa is in: כללי, הודעות האיגוד, שאלות ותשובות, דיון מקצועי, with unread numbers.    | "Rooms the association opened for its members. A member sees the rooms she joined."           |
| **כל החדרים** → **הצטרפות** beside "מתמחים".                                               | A short notice: the people in the room will see your name. Then the room opens.               | "Every active member can join. She is told first that her name will be seen."                 |
| Second window: **Chat** → **Rooms** → **Residents**. First window: write a message, Enter. | The message appears in the second window by itself, under Noa's name.                         | "Live, as in private chat, for everyone in the room."                                         |
| Second window: the three dots beside the message → 👍.                                     | The reaction appears under the message in both windows.                                       | "Six reactions. No free emoji, on purpose."                                                   |
| First window: type `@Yo`, choose the name offered, finish the message, Enter.              | The name stands out in the message; the second window's bell gets a number.                   | "A mention reaches the person under the bell, wherever they are on the site."                 |
| First window: open **הודעות האיגוד**.                                                      | Two pinned messages at the top; one marked "הודעה חשובה". Noa, as a moderator, can write.     | "An announcements room: only moderators write. Important messages stay pinned at the top."    |
| First window: open **כללי** → the three dots beside a message.                             | Besides the usual actions: pin, remove, remove the writer, ban the writer.                    | "A moderator keeps order in her own rooms only. Every such action is recorded with a reason." |
| **פרטים** → **נעילת החדר**. Look at the second window (open "General" there).              | The message box in the second window is replaced by "מנהל/ת החדר נעל/ה אותו…". Unlock it.     | "A room can be locked for an hour, a day, or until it is opened again."                       |
| As `admin@demo.test`: **חדרי צ׳אט**.                                                       | The six rooms, their moderators and number of people; "פתיחת חדר"; categories and reasons.    | "Staff open rooms and appoint moderators. Nothing here needs a developer."                    |
| **דיווחי צ׳אט** → the report marked "בחדר דיון מקצועי".                                    | The reported message and the ones around it; the decision now also offers archiving the room. | "A report from a room shows the same thing: that message and its neighbours."                 |

The seed also leaves a message removed by a moderator and one person banned for a week in "שאלות ותשובות" (open **פרטים** there as Noa to see the ban).

### 10. Groups, invitations and files (3 minutes, optional; added in M13; the room rows no longer apply since M25)

Two windows: `member.full@demo.test` (Noa Bar-Lev) in the first, and in a private window `member.honorary@demo.test` (Ruth Golan).

| Do                                                                                            | The audience sees                                                                                 | Say                                                                                              |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| First window: **צ׳אט**. Look at the top of the list.                                          | "קבוצת קריאה / Reading group" first, marked "נעוצה"; above the list, "2 הזמנות ממתינות".          | "Members make their own small groups. A group can be pinned to the top of the list."             |
| Open the reading group.                                                                       | Messages from three people; one carries a drawn chart and a PDF.                                  | "Pictures, PDF and short videos can be sent. A picture loses what the camera wrote into it."     |
| Press the picture.                                                                            | It opens large.                                                                                   |                                                                                                  |
| Look under the message box.                                                                   | "אין לשלוח תמונות, מסמכים או סרטונים של מטופלים", and the note about what a video carries.        | "The page says plainly what must not be sent, and what a video still contains."                  |
| The three dots beside the message with the files → **העברה** → choose Ruth Golan.             | "ההודעה הועברה אל Ruth Golan." In the second window the copy appears, marked "הועברה".            | "A forwarded copy doesn't say who wrote it."                                                     |
| **הזמנות ממתינות**.                                                                           | Two invitations: a group and a room by invitation; who invited, and for the group who is in it.   | "Nobody is put into a group. You see who invited you, and you are in only if you accept."        |
| Accept the group "מארגני המפגש השנתי".                                                        | The group opens, with the message that was written before.                                        |                                                                                                  |
| **פרטים** in the reading group.                                                               | The people, who runs the group, a dot beside whoever is active now, inviting, and the staff note. | "The association's staff can't read a group. They see only a message that someone reports."      |
| Second window: **Chat settings** → switch off "Show the people I talk with when I am active". | In the first window the dot beside Ruth is gone after reopening the conversation.                 | "Each member decides whether colleagues see when they are around."                               |
| As `admin@demo.test`: **חדרי צ׳אט** → open "ועדת הכנס".                                       | The room is marked "בהזמנה"; the tick box that makes a room by invitation.                        | "A room for a committee: it is not in the list of rooms, and its moderators invite the members." |

The seed has no sample video. To show one, attach any short MP4 from the computer (not of a person).

### 11. Jobs and mentoring (3 minutes, optional; added in M28)

Two windows: `member.resident@demo.test` (Yoav Sela, a resident) in the first, and in a private window `mentor.hila@demo.test` (Dr. Hila Shapira, a fictional mentor). Every position in the demo is made up and says so.

| Do                                                                | The audience sees                                                                                        | Say                                                                                                    |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Signed out: **משרות וחונכות**.                                    | Jobs, fellowships and research posts at hospitals in Israel and three abroad, the nearest closing first. | "Anyone can look for a position, without an account. You apply to the hospital itself."                |
| Choose **השתלמות (פלו)** and the country **צרפת**.                | The fellowship abroad.                                                                                   | "Fellowships abroad are listed too."                                                                   |
| First window: open a position → **שמירה**, then **משרות ששמרתי**. | The saved position.                                                                                      | "A resident keeps a short list. Nobody else sees it."                                                  |
| **חונכים** → filter by language.                                  | Six specialists who offer mentoring: hospital, interests, time, languages.                               | "Specialists choose to offer mentoring, and can stop at any time."                                     |
| **בקשת חונכות** from Dr. Hila Shapira, with a short message.      | "הבקשה נשלחה".                                                                                           | "A short note. Three requests may wait at a time; a request not answered in 30 days closes by itself." |
| Second window: **החונכויות שלי** → **קבלה**.                      | The request becomes active, with **לפתיחת השיחה**.                                                       | "If she declines, he isn't told why. If she accepts, a private conversation opens between them."       |
| First window: **החונכויות שלי** → **לפתיחת השיחה**.               | The conversation, in Chat.                                                                               | "Neither of them had to be listed in the member directory."                                            |
| As `admin@demo.test`: **ניהול → משרות**.                          | The positions, one waiting for review; the writer can't publish their own.                               | "A department director posts for their department; someone else reviews it before it shows."           |

### 12. Communities (3 minutes, optional; added in M25)

Two windows: `member.resident@demo.test` (Yoav Sela, a resident) in the first, and in a private window `member.full@demo.test` (Noa Bar-Lev, who moderates Andrology). The posts are made up and talk about training, never about a patient.

| Do                                                                                                          | The audience sees                                                                                    | Say                                                                                                         |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| First window: **קהילות**.                                                                                   | A community for each subspecialty, with how many posts; the note that staff can read them.           | "Questions and discussions by subspecialty, under each person's own name, and they stay to be found."       |
| Open **אנדרולוגיה** → **כתיבת פוסט**, choose **שאלה**, and in the text type an ID number such as 123456782. | Before anything is sent: the number, and that it looks like an ID number; the Post button stays off. | "Nothing that identifies a patient gets through: the page stops it, and so does the server."                |
| Replace the number with an ordinary question, and post it.                                                  | The question, with its comments below.                                                               |                                                                                                             |
| Second window: open the question and answer it.                                                             | The comment appears.                                                                                 |                                                                                                             |
| First window: **סימון כתשובה** on Noa's comment; press 🙏.                                                  | "התשובה" beside it; the question is marked "נענתה" in the list.                                      | "The one who asked marks what helped; anyone can thank."                                                    |
| **מעקב** on the community, then **מהקהילות שאני עוקב/ת אחריהן**.                                            | The feed of followed communities.                                                                    |                                                                                                             |
| Second window: on an off-topic comment, **הסרה** with a reason.                                             | "הוסר על ידי מנהל/ת הקהילה" and the reason, in its place.                                            | "Each community has its own moderators; what they remove leaves a note, and the audit log has who and why." |
| **צ׳אט**.                                                                                                   | Private conversations and groups only.                                                               | "Rooms became communities."                                                                                 |

### 13. Research (3 minutes, optional; added in M27)

Two windows: `member.resident@demo.test` (Yoav Sela, a resident) in the first, and in a private window `mentor.hila@demo.test` (Dr. Hila Shapira, a fictional specialist who leads the paediatric teaching study). Every project and publication in the demo is made up and says so.

| Do                                                                                   | The audience sees                                                                            | Say                                                                                                              |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| First window: **מחקר**.                                                              | Six sample projects, with what each looks for: centres, a statistician, residents, students. | "Studies that look for collaborators. A project holds no data about participants."                               |
| Filter by **מחפשים: מתמחים**; open the paediatric teaching project.                  | Its type, status, lead and the ethics approval "לפי הצהרת החוקר/ת הראשי/ת".                  | "The ethics approval is shown as the lead declares it. The platform doesn't check it."                           |
| **בקשה להצטרף**, with a short message.                                               | "הבקשה נשלחה".                                                                               | "Five requests may wait at a time; one not answered in 30 days closes by itself."                                |
| Second window: **מחקר → בקשות**.                                                     | Yoav's request, with his message.                                                            | "Asking shares a name, the student or resident mark, the hospital and the message, nothing else."                |
| **קבלה**, then open the project → **לפתיחת הקבוצה של הפרויקט**.                      | The project's group, in Chat.                                                                | "Accepting adds them to the project's group."                                                                    |
| First window: **הפרופיל שלי → פרסומים → מילוי מ־PubMed**, and type a real PubMed ID. | The title, authors, journal and year, filled in; nothing saved until **שמירה**.              | "Only the number is sent to PubMed. ORCID works the same way. Here we cancel: the demo keeps to made-up papers." |

### 14. Journal club (3 minutes, optional; added in M31)

Two windows: `member.resident@demo.test` (Yoav Sela, a resident) in the first, and in a private window `admin@demo.test`. The articles are made up and say so; the texts talk about training only.

| Do                                                                                              | The audience sees                                                                                    | Say                                                                                                |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| First window: **מועדון עיתונות**.                                                               | October's entry first, in Hebrew; September's below it, closed.                                      | "An article each month, chosen and summarised by members, with an expert's commentary."            |
| Open October's entry.                                                                           | The article's details and a link to the publisher; the summary and commentary, each with its author. | "The article itself is never copied here. Everyone sees who wrote the summary and the commentary." |
| Under **האם זה ישנה את הפרקטיקה שלך?** press **אולי**.                                          | The totals appear, as percentages.                                                                   | "Anonymous: only the totals, and only after answering. It is members' opinion, not a guideline."   |
| **לדיון בקהילה**.                                                                               | The entry's discussion post in the Robotic surgery community, with two comments.                     | "The discussion lives in the community, with its moderators and reports."                          |
| Second window: **ניהול → מועדון עיתונות** → the November entry, waiting for review → **פרסום**. | The entry is published, and its discussion opens in the Pediatric urology community.                 | "One editor writes, another publishes. The writer can't publish their own."                        |

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

See [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md). In short: this is a demo on one computer with fictional data. There is no payment, no CME tracking, no mobile app yet, chat is not end-to-end encrypted and its files have not been through the legal review, and nothing has been through a legal or security review for real members' data.
