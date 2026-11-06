# KPSMS user guide (Khmer): how it is made and how to update it

This folder holds the Khmer user guide of the Khmer Primary School Management System (KPSMS), written for a Cambodian school administrator or teacher with little computer experience.

| File or folder | What it is |
|---|---|
| `USER-GUIDE-KM.md` | **The only source of the guide.** Edit this file. |
| `USER-GUIDE-KM.pdf` | The printable A4 PDF made from it (cover, table of contents, page numbers in Khmer digits, the Khmer fonts embedded). Do not edit it by hand: build it again. |
| `SCREENSHOTS/` | The pictures used by the guide, taken from the **real program** on a **fictional** sample school (numbered red markers are drawn on top of the live page). |
| `guide.config.json` | The words on the cover (title, audience, edition, date, the draft notice). |
| `tools/` | The scripts that build, check and illustrate the guide (see below). |

**Status:** a draft. The Khmer was written by an AI from the program's own screen texts and has **not been read by a native Khmer speaker**. It says so on the cover. Please do not hand it out as final before that review.

## 1. The rules the guide follows

* It documents only what the program really does. Every screen text quoted as «…» must be a text of the program (`frontend/i18n/locales/km.json`, or the start-up and error windows in `desktop/src/static/`). **«…» is used for labels of the screen only** (never for examples, names or things that do not exist).
* Every operation is written the same way: **គោលបំណង៖** (purpose), **ជំហានទី១៖** … (steps, numbered without a gap), **លទ្ធផល៖** (what should happen) and **ចំណាំ៖** or **ប្រុងប្រយ័ត្ន៖** (tips and warnings).
* Names, schools and numbers in the pictures and examples are **fictional** (the program's sample school). The times in the timetable and attendance pictures are examples typed for the picture: the program ships no school times.
* Features that are not built are said to be **not available** in the chapter they belong to and in appendix ខ. Nothing is described that the program cannot do. The program is offline: the guide never suggests a cloud or an online service.
* A backup kept on the laptop does not protect against a failed SSD, theft or physical damage: chapters ១ and ១៥ say so.

## 2. Editing the text

Edit `USER-GUIDE-KM.md`. The Markdown it understands is small and strict (`tools/md.mjs`):

```
# ជំពូកទី១៖ title        a chapter (a new page)          ## ១.១ title   a section          ### title   an operation
**គោលបំណង៖** …           **ជំហានទី១៖** …                  **លទ្ធផល៖** …    **ចំណាំ៖** …        **ប្រុងប្រយ័ត្ន៖** …      (coloured blocks)
«label»                  a label exactly as on the screen
![caption](SCREENSHOTS/file.png)    a numbered figure; say in the caption what each red number points at
| a | b |                 tables         - bullets       1. numbers          > a quoted note        <!-- pagebreak -->
```

The 17 chapters that were asked for keep their exact titles (the check below enforces it); appendices ក and ខ follow.

## 3. Checking the guide

```
node docs/user-guide/tools/check-guide.mjs
```

It reads the guide and prints what it found; it changes nothing. It checks that every «label» is a text of the program, every picture exists and every picture file is used, the 17 chapters are present in order under their exact titles, the steps of every operation are numbered 1, 2, 3 … and each operation has a purpose. It lists the places that mention the internet or a cloud so that a person can confirm each one says the program does **not** use it. It must print "no problem found".

## 4. Building the PDF

```
node docs/user-guide/tools/build.mjs
```

It starts the program's own Electron (the engine that prints the program's reports) with `tools/build-pdf.mjs`, prints A4 with the Noto Sans Khmer and Moul fonts of the program (`node_modules/@fontsource`, embedded in the PDF), and reads the page numbers of the table of contents back from the finished PDF (its outline), so they are always right. Nothing is downloaded and nothing of the program is changed. It needs `node_modules/electron/dist/electron.exe` (if it is missing: `node node_modules/electron/install.js`).

To **look at** pages (Khmer shaping, page numbers, figures, page breaks):

```
node_modules\electron\dist\electron.exe docs\user-guide\tools\pdf-to-png.cjs <pdf> <folder> <page> [<page> ...]   (one Electron process per page is the most reliable)
node_modules\electron\dist\electron.exe docs\user-guide\tools\contact-sheet.cjs <out.png> <columns> <file.png> ...   (many pictures in one)
```

(On a terminal that sets `ELECTRON_RUN_AS_NODE`, clear it first; `build.mjs` does that itself.)

## 5. Retaking the pictures

The pictures must be retaken whenever the screens change. They come from the **real app** on **scratch** data, never from a school's data and never from the owner's `.sample-data`.

1. Make sure the program is built as the tests need it: the extracted backend (`npm run backend:build` then `node scripts/extract-backend.mjs`), the generated UI (`npm run generate -w frontend`) and the desktop build (`npm run build -w desktop`).
2. First launch (an **empty** folder): `node docs/user-guide/tools/capture-screenshots.mjs --part wizard --data <empty folder>`. It walks the wizard with fictional names and takes the setup, sign-in, recovery-key and "forgot password" pictures.
3. The other chapters: build the program's fictional sample school in a new folder, `node scripts/seed-sample-data.mjs --dir <new folder>`, then `node docs/user-guide/tools/capture-screenshots.mjs --part sample --data <that folder>` (`--only <scene prefix>` retakes a few). It creates a second year, a class, timetable slots and lessons, attendance, a backup and so on **in that scratch folder only**: use a fresh folder for every full run, and delete it afterwards.
4. A scene that fails prints the page it stopped on and its buttons; fix the scene (`tools/scenes-sample.mjs`) and run it again. With `KPSMS_GUIDE_DEBUG_DIR=<folder>` a picture of the failed page is saved there.
5. The window is 1280 × 900 CSS pixels (the capture tool lifts the program's own cap on its window size) at a device scale of 1.5, so the pictures are 1920 × 1350. Markers are drawn on the live page at the real position of each element, then removed. The PDF builder cuts the menu column off most pictures of the program's window (it is about 18 % of the width) so that the rest is larger on paper; the original files are untouched.

Then run the check (section 3) and build the PDF (section 4), and look at the pages.

## 6. When the program changes

After a change of the program, re-read the chapters whose screens changed and retake their pictures:

| Screen or code | Chapter |
|---|---|
| menu, top bar, lock, dashboard (`layouts/`, `components/app/`, `pages/dashboard.vue`) | ១, ១៥ |
| `pages/setup.vue`, `login.vue`, `recover.vue`, recovery key | ២, ១៧ |
| `settings/school.vue` | ៣ |
| `settings/academic.vue` (years, subjects, grade table) | ៤, ៥ |
| `classes/` | ៥ |
| `teachers/` | ៦ |
| `students/` (list, new, profile, promotion) | ៧ |
| `attendance/`, `settings/attendance-sessions.vue` | ៨ |
| `timetable/`, `settings/timetable.vue` | ៩ |
| `exams/`, `settings/grading.vue` | ១០ |
| `report-cards/`, `honor-roll/`, `monthly-ranking/`, `settings/report-card.vue`, `settings/reports.vue` | ១១ |
| `homework/` | ១២ |
| `fees/`, `settings/fees.vue` | ១៣ |
| `reports/` | ១៤ |
| `settings/backup.vue` and the backup code | ១៥ |
| `settings/security.vue`, `preferences.vue`, `system.vue`, `performance.vue`, `audit.vue`, `about.vue` | ១៧ |

If a screen text changes in `km.json`, the check (section 3) names every place in the guide that still quotes the old words.

## 7. What is not covered

See "Coverage and known gaps" below, which was written when the guide was made.

## Coverage and known gaps (written when the guide was made, 2026-11-06)

**What is in the guide:** 17 chapters under the exact titles that were asked for, plus appendix ក (a seasonal checklist) and appendix ខ (what is not in this version); 565 quoted screen labels; 46 operations written as purpose, numbered steps, result and tip; 86 pictures; a 132-page A4 PDF (about 19 MB) with a cover, a 3-page table of contents whose page numbers are read back from the PDF, page numbers in Khmer digits, and the Noto Sans Khmer and Moul fonts embedded.

**How it was checked against the program (what each check proves, and what it does not):**

| Check | Result |
|---|---|
| `tools/check-guide.mjs`: every «label» is a text of the program; 17 chapters in order; step numbering; purpose lines; every picture used | no problem found: 509 labels are exactly a screen text, 56 are part of a longer screen text |
| `tools/verify-claims.mjs` on a scratch copy of the sample school: 25 statements about what the **real running app** does (validation messages, disabled buttons, defaults, the backup line and its information button, the school-event form, paging) | every check passed |
| The picture run itself: the real first-launch wizard, sign-in, the year, class, slot and backup forms, attendance, and the screens of every chapter, each taken from the live app | all 86 pictures taken; each was looked at |
| The PDF: A4 page size, fonts embedded, outline present, table-of-contents numbers equal the real page of each heading (chapters 8 and 15 opened and looked at), Khmer shaping and the footer numbers looked at on rendered pages | as described |
| The program's sources before and after | unchanged (`node scripts/release-preflight.mjs --compare`: 0 changed, 0 added, 0 removed); nothing was built, installed or released |

**Written from reading the program's code, not run in the real app** (the guide says what the code does; please confirm these on the school's computer): the lock-out steps after wrong passwords (1, 5 and 15 minutes); the 24-hour rule and the automatic backup when the program closes; the exit question and the closing overlay; restoring a backup end to end (the program's own test suites run it; this guide's run did not); the Windows folder and file dialogs (copy to USB, save as PDF or Excel, choose a logo or a photo); the server session ending after 30 minutes without use; what the Excel files contain; how a date field looks on the school's Windows settings; everything about **physical printing** and a **real USB stick**, which have never been tried on hardware.

**Screens described in words but without a picture of their own:** the pop-ups for adding a fee, charging a whole class, adding or editing a fee category and cancelling a receipt; the confirmations for deleting a class, a subject, a student or a homework and for letting a teacher go; the student's enrol, leave and graduate pop-ups and the duplicate-student warning; the sub-subject pop-up; the copy-a-timetable pop-ups and their preview, and the teacher-clash message; the discard-changes question of attendance; the exam's "structure is locked" box and its delete confirmation; the grading-scale form; the sign-off pop-up of "អំពីប្រព័ន្ធ"; the change-password and new-recovery-key forms, the forced recovery-key page, the lock-out box and the session-expired notice; the start-up and error windows and the "data service stopped" overlay; the Windows dialogs; the closing overlay and the exit question; the roll of honour and monthly ranking print previews; a closed year; most empty states.

**Features not described because they are not built** (stated as such in the guide): cloud, internet or multi-user use; deleting an academic year; copying classes between years; importing students from Excel; viewing the recovery key again; scheduled backups, automatic USB copy, backup encryption; quiz marks; an Excel file for the monthly ranking; deleting an attendance sheet, a homework or a grading scale; "today's lessons" on the dashboard.

**Not covered in depth:** the twenty artwork styles of the roll of honour and every font control of its five text boxes (the guide gives the steps and the rules, not each style); the individual items of the readiness list in "អំពីប្រព័ន្ធ"; the full list of change-history action names.

**Language:** the Khmer is an AI draft written from the program's own screen texts (which are themselves unreviewed: `frontend/i18n/REVIEW.md`). It has not been read by a native speaker; the cover says so. Please have it read before it is handed to a school.

**Pictures:** they show a 1280 × 900 window at a device scale of 1.5. On paper the screen text is small (about 6 pt); in the PDF it can be zoomed without losing sharpness. If larger text is wanted on paper, retake the pictures at a narrower window (the capture tool takes the size from `VIEW` in `tools/shots-lib.mjs`).
