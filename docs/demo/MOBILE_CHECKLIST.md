# The app on a phone: a checklist by hand

The app's rules are tested automatically, but nothing automatic taps through the app on a phone (that needs an emulator, which this project does not have; plan M14 §7). This list stands in for it. Go through it on a real phone, in Hebrew and in English, and write the date and what was seen next to each line.

How to open the app on a phone: `apps/mobile/README.md`. Demo accounts and the demo password: the main `README.md`.

**Gone through by the owner on 2026-10-06,** on an Android 16 phone, with the installed .apk. The owner's words: "i have installed the apk and all works as intended, i have checked the mobile_checklist and the new hebrew text and its all good". Each line below carries that date. The marks record the owner's report as a whole; the owner did not report line by line, and Claude saw none of it.

## Opening and signing in

| What to do                           | What should happen                                                  | Seen on                                  |
| ------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------- |
| Open the app                         | The sign-in screen, in the phone's language                         | Reported by the owner, 2026-10-05        |
| Sign in as `member.full@demo.test`   | Home, with the membership state                                     | Owner, 2026-10-06                        |
| Close the app completely and open it | The fingerprint or face check, then Home, still signed in           | Owner, 2026-10-06                        |
| "Me" → change the language           | The texts change at once; the page changes sides                    | Sides: reported by the owner, 2026-10-05 |
| "Me" → "Connection check"            | "Live updates arrive on this phone"                                 | Reported by the owner, 2026-10-05        |
| On the site: Account → Security      | The phone is listed among the sessions; ending it signs the app out | Owner, 2026-10-06                        |

## Card, news, events, notifications

| What to do                                               | What should happen                                               | Seen on           |
| -------------------------------------------------------- | ---------------------------------------------------------------- | ----------------- |
| "Me" → "My membership card"                              | The card with a code; "Back" returns                             | Owner, 2026-10-06 |
| Flight mode, then the card again                         | The card as it last was, with its date and without a code        | Owner, 2026-10-06 |
| News: a category, "Show more", an item, a file           | The item with its picture; the file opens in the phone's browser | Owner, 2026-10-06 |
| Events: an event, "Register", tick sessions, save        | "You are registered"; the schedule is saved                      | Owner, 2026-10-06 |
| Events: "View my schedule", then cancel the registration | The event is listed, then gone                                   | Owner, 2026-10-06 |
| Home → "Open notifications"                              | The list; "Mark as read" and "Mark all as read" work             | Owner, 2026-10-06 |
| A notice about news or an event                          | Opens that item inside the app                                   | Owner, 2026-10-06 |
| "Me" → "Notification settings": change one and save      | "Saved"; the site shows the same                                 | Owner, 2026-10-06 |

## Chat

Use two people: the phone as one, the site in a browser as the other.

| What to do                                                                                                              | What should happen                                               | Seen on           |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------- |
| Chat → "New conversation": find the other person, write                                                                 | The message appears; on the site it arrives without reloading    | Owner, 2026-10-06 |
| The other person answers on the site                                                                                    | The answer appears in the app within a second or two             | Owner, 2026-10-06 |
| Leave the conversation                                                                                                  | The Chat tab shows a number when something is unread             | Owner, 2026-10-06 |
| "⋯" on a message: react, reply, edit, delete for everyone                                                               | Each shows on both sides                                         | Owner, 2026-10-06 |
| "⋯" → "Forward" to another conversation                                                                                 | A copy arrives there, marked "Forwarded"                         | Owner, 2026-10-06 |
| "Photo or video": send a picture                                                                                        | The picture shows in the message on both sides                   | Owner, 2026-10-06 |
| "Camera": take and send a picture                                                                                       | The phone asks for the camera once; the picture arrives          | Owner, 2026-10-06 |
| "PDF": send a PDF                                                                                                       | A link to the file; it opens in the phone's browser              | Owner, 2026-10-06 |
| "Details": mute, pin, mark as unread, archive                                                                           | Each shows in the list                                           | Owner, 2026-10-06 |
| "Details" → "Block this person", then unblock                                                                           | Writing is closed, then open again                               | Owner, 2026-10-06 |
| "⋯" on the other person's message → "Report"                                                                            | "Your report was sent"; the staff see it on the site             | Owner, 2026-10-06 |
| "New group": a name, invite the other person                                                                            | They get an invitation; after accepting, both write in the group | Owner, 2026-10-06 |
| In a group: "@" and the start of a name                                                                                 | The person is offered; the mention stands out in the message     | Owner, 2026-10-06 |
| Rooms → "Browse rooms": join a room, write, leave                                                                       | Joining asks first; leaving returns to the list                  | Owner, 2026-10-06 |
| As a room's moderator (`member.full@demo.test` moderates one of the sample rooms): pin, remove a message, lock the room | Each shows for the other person                                  | Owner, 2026-10-06 |
| Chat → "Chat settings": change one and save                                                                             | "Saved"; the site shows the same                                 | Owner, 2026-10-06 |
| Put the app in the background for a minute, write to it from the site, return                                           | The new message is there                                         | Owner, 2026-10-06 |

## Education, guidelines, directory, search (M15)

| What to do                                         | What should happen                                                       | Seen on           |
| -------------------------------------------------- | ------------------------------------------------------------------------ | ----------------- |
| Home → "Education": a filter, "Show more", an item | The item with its text; a link opens in the phone's browser              | Owner, 2026-10-06 |
| A course                                           | Its lessons; one open to members opens, a locked one says "For members"  | Owner, 2026-10-06 |
| Home → "Practise exam questions": answer one       | Right or not, the right answer, why for each option; "Next question"     | Owner, 2026-10-06 |
| Exam practice → "My results"                       | The questions answered, with the first answer counted                    | Owner, 2026-10-06 |
| Home → "Guidelines": a status, a guideline         | Its source and versions; "Open the official guideline" opens the browser | Owner, 2026-10-06 |
| Home → "Member directory": search, open a member   | Only what they chose to show; "Write to" opens a conversation            | Owner, 2026-10-06 |
| Home → "Search": a word found in news and events   | Results by kind; one opens inside the app; "Show all" works              | Owner, 2026-10-06 |

## The account (M15)

| What to do                                      | What should happen                                                     | Seen on           |
| ----------------------------------------------- | ---------------------------------------------------------------------- | ----------------- |
| "Me" → "My profile": change a field and save    | "Your profile was saved"; the site shows the same                      | Owner, 2026-10-06 |
| My profile: choose a photo, then remove it      | The photo shows, then is gone                                          | Owner, 2026-10-06 |
| My profile: "Who can see this" for one field    | Saved; the directory shows or hides the field accordingly              | Owner, 2026-10-06 |
| My profile: join the directory, then leave      | The text changes each time                                             | Owner, 2026-10-06 |
| "Me" → "My membership"                          | Its state and history; "Show my membership card"                       | Owner, 2026-10-06 |
| "Me" → "Account security": change the password  | "Password changed"; other sessions are signed out                      | Owner, 2026-10-06 |
| Account security: turn on two-step verification | The key is shown; after the code, recovery codes; "Copy" works         | Owner, 2026-10-06 |
| Account security: a change after a while        | "Confirm it's you" asks for the password, then the change goes through | Owner, 2026-10-06 |
| Account security: sign out another session      | It is gone from the list                                               | Owner, 2026-10-06 |
| "Me" → "Accessibility statement"                | The same text as the site                                              | Owner, 2026-10-06 |
| A notice about a message from the association   | Opens the message inside the app                                       | Owner, 2026-10-06 |

## The camera and files (M15)

| What to do                                                                   | What should happen                                                | Seen on           |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------- |
| Home → "Scan a code": the first time                                         | The app asks for the camera once                                  | Owner, 2026-10-06 |
| Scan the code of an event you registered for (the staff show it on the site) | "Your attendance was recorded"; a second scan says it already was | Owner, 2026-10-06 |
| Scan the code of another member's card                                       | "Valid membership", with the name and the kind                    | Owner, 2026-10-06 |
| Scan any other QR code                                                       | "This is not a code of IUA Connect"; nothing opens                | Owner, 2026-10-06 |
| An event → "Add to my calendar"                                              | The phone offers a calendar app; the event is added               | Owner, 2026-10-06 |
| "My schedule" → the calendar file                                            | The same, for the sessions chosen                                 | Owner, 2026-10-06 |

## Chat additions (M15)

| What to do                                                  | What should happen                                                     | Seen on           |
| ----------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------- |
| Chat → "Search messages": a word                            | Results from every thread; "Go to this message" opens it there, marked | Owner, 2026-10-06 |
| In a thread opened at an old message                        | "Go to the newest messages" returns to the end                         | Owner, 2026-10-06 |
| A private conversation while the other person has chat open | "Active now" under their name                                          | Owner, 2026-10-06 |
| "⋯" → "Copy text", then paste elsewhere                     | The message's text                                                     | Owner, 2026-10-06 |
| A group you run → "Details"                                 | Invitations waiting; "Take back" removes one                           | Owner, 2026-10-06 |

## Without signing in (M15)

| What to do                                              | What should happen                                                        | Seen on           |
| ------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------- |
| Sign out; "Continue without signing in"                 | Home for a visitor; tabs Home, News, Events only                          | Owner, 2026-10-06 |
| A public event as a visitor                             | "Sign in to register", and a button back to sign-in                       | Owner, 2026-10-06 |
| "Forgot your password?" with an address                 | "If an account exists…"; the email's link opens the site                  | Owner, 2026-10-06 |
| "Open an account"                                       | "Check your email"; after verifying on the site, sign in here             | Owner, 2026-10-06 |
| Signed in without a membership: "Me" → "My application" | The form; after sending, the application with its state; "Withdraw" works | Owner, 2026-10-06 |

## Accessibility

| What to do                                              | What should happen                                                | Seen on           |
| ------------------------------------------------------- | ----------------------------------------------------------------- | ----------------- |
| TalkBack on: Home, News, an event, Chat, a conversation | Every control is named; headings are announced as headings        | Owner, 2026-10-06 |
| The phone's text size at its largest                    | Nothing is cut off or overlaps                                    | Owner, 2026-10-06 |
| Hebrew: a conversation                                  | The reader's own messages are on the opposite side to the others' | Owner, 2026-10-06 |
| The keyboard open in a conversation                     | The box being written in stays visible                            | Owner, 2026-10-06 |
