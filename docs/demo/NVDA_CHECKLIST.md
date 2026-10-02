# Screen-reader check with NVDA

Automated checks can't hear the site. This list is for a person to go through once with the NVDA screen reader, in Hebrew. It takes about an hour. Write down anything that sounds wrong, with the page and what you were doing; each note becomes a fix or a line in the accessibility statement.

## Set-up (10 minutes)

1. Install NVDA from **nvaccess.org** (free). During the first start choose the laptop or desktop keyboard layout that matches your keyboard.
2. In NVDA: **Preferences → Settings → Speech**. Choose a Hebrew voice if Windows has one (Windows Settings → Time & language → Speech → add Hebrew). Tick **Automatic language switching**, so English text inside a Hebrew page is read in English.
3. Use **Chrome** or **Edge**.
4. Start the demo (`pnpm dev`) and open http://localhost:3001.
5. Put the mouse aside. Everything below is done with the keyboard.

**The keys you need**

| Key                 | What it does                                     |
| ------------------- | ------------------------------------------------ |
| `Ctrl`              | Stop speaking                                    |
| `Tab` / `Shift+Tab` | Next / previous link, button or field            |
| `H` / `Shift+H`     | Next / previous heading                          |
| `1`, `2`, `3`       | Next heading of that level                       |
| `D`                 | Next landmark (header, navigation, main, footer) |
| `F`                 | Next form field                                  |
| `T`                 | Next table                                       |
| `Ctrl+Alt+arrows`   | Move inside a table, cell by cell                |
| `↓` / `↑`           | Read the next / previous line                    |
| `NVDA+F7`           | A list of all links, headings and landmarks      |
| `Enter` / `Space`   | Activate                                         |

(`NVDA` is the `Insert` key, or `Caps Lock` if you chose that.)

## What to listen for, on every page

- The **page title** is read when the page opens, and it names the page.
- **Hebrew is read in Hebrew**, and English names inside it (emails, "IUA Connect") in English.
- Each **button and link says what it does** without the text around it ("הסרת …", not just "הסרה").
- Each **form field says its label**, and its hint.
- After pressing a button, **the result is announced** ("נשמר.", an error) without you looking for it.
- Nothing is announced twice, and nothing invisible is read.

## The journeys

Tick each one, or note what was wrong.

| #   | Do this                                                                                                                       | It should sound like this                                                                                                                              | OK / note |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 1   | Open the home page. Press `Tab` once.                                                                                         | First the demo notice; the first Tab stop is "דילוג לתוכן הראשי". `Enter` on it, then `Tab`: you are inside the main content, past the menu.           |           |
| 2   | Press `D` several times.                                                                                                      | A notices region, the banner, the main navigation, the main content, the footer. Each has a name.                                                      |           |
| 3   | `NVDA+F7` → headings.                                                                                                         | One level-1 heading; the others in order, no levels skipped.                                                                                           |           |
| 4   | The language links in the header.                                                                                             | "עברית" read in Hebrew and marked as current; "English" read in English.                                                                               |           |
| 5   | Search: `Tab` to the search field, type **בכנס**, `Enter`.                                                                    | The field is called "חיפוש באתר". On the results page: a heading with the query, then groups ("חדשות, 1 תוצאה").                                       |           |
| 6   | **חדשות** → open an article. Read it with `↓`.                                                                                | Title as a level-1 heading; date; the text. An English-only item is read in English.                                                                   |           |
| 7   | **אירועים** → the annual meeting.                                                                                             | Date and place read as text; the programme as a list of sessions with times and speakers.                                                              |           |
| 8   | **כניסה**: leave both fields empty and submit. Then sign in as `member.full@demo.test` with a wrong password, then correctly. | Each field says its label. The error ("כתובת הדוא״ל או הסיסמה שגויים.") is announced at once. After signing in, the dashboard heading is read.         |           |
| 9   | The dashboard. `H` through the sections.                                                                                      | "החברות שלי", "התראות", "אירועים קרובים", "חדשות", "הדרכה", "פעולות מהירות". The four later actions are read as text with "בקרוב", not as links.       |           |
| 10  | The bell in the header.                                                                                                       | "התראות, N חדשות", as a link.                                                                                                                          |           |
| 11  | Notifications → **בחירה מה לקבל**. `T` to the table, move with `Ctrl+Alt+arrows`. Change a switch, save.                      | Each tick box says its kind and channel ("חדשות: בדוא״ל"). The locked row says it can't be changed. "נשמר." is announced.                              |           |
| 12  | The account menu button (your email). `Enter`, `Tab` through it, `Esc`.                                                       | "תפריט החשבון", collapsed / expanded. `Esc` closes it and you are back on the button.                                                                  |           |
| 13  | **הפרופיל שלי**: go through the form with `F`.                                                                                | Every field has a label; each "who can see this" choice says which field it belongs to.                                                                |           |
| 14  | **כרטיס חבר**.                                                                                                                | The QR code has a text description; name, type and validity are read as text.                                                                          |           |
| 15  | **הדרכה → תרגול שאלות מבחן** (needs one published question). Choose an answer with the arrow keys, submit.                    | The question is the name of the group of answers. After submitting, focus moves to "נכון." or "לא נכון.", then each answer with why, then the summary. |           |
| 16  | Sign in as `admin@demo.test`. **ניהול**.                                                                                      | The admin sections are a second navigation with its own name; the current one is announced as current.                                                 |           |
| 17  | **חברים**: `T` to the table.                                                                                                  | Column headers are read as you move across a row.                                                                                                      |           |
| 18  | **חדשות → new item**: the Hebrew / English tabs, the text editor's buttons.                                                   | Tabs say "selected" or not. Each editor button says what it does.                                                                                      |           |
| 19  | Switch the whole site to English and repeat 1, 8 and 9.                                                                       | Read in English, left to right.                                                                                                                        |           |

## When you are done

Tell Claude what you noted. The accessibility statement (`/accessibility`) says today that this check has not been done; it is updated with the date and what was found.
