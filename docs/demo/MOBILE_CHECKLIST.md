# The app on a phone: a checklist by hand

The app's rules are tested automatically, but nothing automatic taps through the app on a phone (that needs an emulator, which this project does not have; plan M14 §7). This list stands in for it. Go through it on a real phone, in Hebrew and in English, and write the date and what was seen next to each line.

How to open the app on a phone: `apps/mobile/README.md`. Demo accounts and the demo password: the main `README.md`.

**Nothing below has been gone through yet,** apart from the three lines marked as reported.

## Opening and signing in

| What to do                           | What should happen                                                  | Seen on                                  |
| ------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------- |
| Open the app                         | The sign-in screen, in the phone's language                         | Reported by the owner, 2026-10-05        |
| Sign in as `member.full@demo.test`   | Home, with the membership state                                     |                                          |
| Close the app completely and open it | The fingerprint or face check, then Home, still signed in           |                                          |
| "Me" → change the language           | The texts change at once; the page changes sides                    | Sides: reported by the owner, 2026-10-05 |
| "Me" → "Connection check"            | "Live updates arrive on this phone"                                 | Reported by the owner, 2026-10-05        |
| On the site: Account → Security      | The phone is listed among the sessions; ending it signs the app out |                                          |

## Card, news, events, notifications

| What to do                                               | What should happen                                               | Seen on |
| -------------------------------------------------------- | ---------------------------------------------------------------- | ------- |
| "Me" → "My membership card"                              | The card with a code; "Back" returns                             |         |
| Flight mode, then the card again                         | The card as it last was, with its date and without a code        |         |
| News: a category, "Show more", an item, a file           | The item with its picture; the file opens in the phone's browser |         |
| Events: an event, "Register", tick sessions, save        | "You are registered"; the schedule is saved                      |         |
| Events: "View my schedule", then cancel the registration | The event is listed, then gone                                   |         |
| Home → "Open notifications"                              | The list; "Mark as read" and "Mark all as read" work             |         |
| A notice about news or an event                          | Opens that item inside the app                                   |         |
| "Me" → "Notification settings": change one and save      | "Saved"; the site shows the same                                 |         |

## Chat

Use two people: the phone as one, the site in a browser as the other.

| What to do                                                                                                              | What should happen                                               | Seen on |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------- |
| Chat → "New conversation": find the other person, write                                                                 | The message appears; on the site it arrives without reloading    |         |
| The other person answers on the site                                                                                    | The answer appears in the app within a second or two             |         |
| Leave the conversation                                                                                                  | The Chat tab shows a number when something is unread             |         |
| "⋯" on a message: react, reply, edit, delete for everyone                                                               | Each shows on both sides                                         |         |
| "⋯" → "Forward" to another conversation                                                                                 | A copy arrives there, marked "Forwarded"                         |         |
| "Photo or video": send a picture                                                                                        | The picture shows in the message on both sides                   |         |
| "Camera": take and send a picture                                                                                       | The phone asks for the camera once; the picture arrives          |         |
| "PDF": send a PDF                                                                                                       | A link to the file; it opens in the phone's browser              |         |
| "Details": mute, pin, mark as unread, archive                                                                           | Each shows in the list                                           |         |
| "Details" → "Block this person", then unblock                                                                           | Writing is closed, then open again                               |         |
| "⋯" on the other person's message → "Report"                                                                            | "Your report was sent"; the staff see it on the site             |         |
| "New group": a name, invite the other person                                                                            | They get an invitation; after accepting, both write in the group |         |
| In a group: "@" and the start of a name                                                                                 | The person is offered; the mention stands out in the message     |         |
| Rooms → "Browse rooms": join a room, write, leave                                                                       | Joining asks first; leaving returns to the list                  |         |
| As a room's moderator (`member.full@demo.test` moderates one of the sample rooms): pin, remove a message, lock the room | Each shows for the other person                                  |         |
| Chat → "Chat settings": change one and save                                                                             | "Saved"; the site shows the same                                 |         |
| Put the app in the background for a minute, write to it from the site, return                                           | The new message is there                                         |         |

## Accessibility

| What to do                                              | What should happen                                                | Seen on |
| ------------------------------------------------------- | ----------------------------------------------------------------- | ------- |
| TalkBack on: Home, News, an event, Chat, a conversation | Every control is named; headings are announced as headings        |         |
| The phone's text size at its largest                    | Nothing is cut off or overlaps                                    |         |
| Hebrew: a conversation                                  | The reader's own messages are on the opposite side to the others' |         |
| The keyboard open in a conversation                     | The box being written in stays visible                            |         |
