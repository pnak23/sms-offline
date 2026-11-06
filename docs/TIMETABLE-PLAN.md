# Weekly timetable — technical plan for the owner's review (2026-11-05)

**Status: BUILT 2026-11-06 (migration V10) and ACCEPTED by the owner on 2026-11-06** (the implementation and its final verification; the application is **not** declared release-ready, and the final installer is on hold until the owner's separate approval; the owner confirmed the Khmer wording of `frontend/i18n/REVIEW.md` §19 acceptable on 2026-11-06 with no correction, see `docs/RELEASE-BUILD-RUNBOOK.md`). Sections 0–7 are the plan as it was shown to the owner (who approved it on 2026-11-05 and added the requirements of section 8); **section 9 lists what the finished build changed from it.** The evidence is in `docs/CHANGE-ROUND-PROGRESS.md` (the timetable round). The final Phase 6 release build still waits until all approved changes are finished and tested, and D22 (install, uninstall, reinstall) waits for the owner's separate permission.

## 0. What was inspected, and what it means for the design
* `teacher_assignments (class_id, subject_id, teacher_id)`, unique per class and subject, **main subjects only** (the service refuses a subject that is not offered to the class's grade or a teacher who is not active). It is the "default teacher" of a timetable cell.
* `attendance_periods` (V7) already shows the pattern the owner liked for configurable times: per academic year, "HH:mm" times checked by the database and the service, optimistic version, reorder, a closed year is read-only, nothing is invented. The timetable slots follow it but are **separate**: attendance sessions are for attendance, and the owner excluded any attendance integration.
* A closed academic year already freezes classes, assignments, attendance, examinations and homework (`ACADEMIC_YEAR_CLOSED`). The timetable follows the same rule.
* `ApiException` can carry extra values with its code, so a clash can say **which class** the teacher is already in.
* Reports are built as one table in the browser and shared by the preview, the A4 page and the Excel file. A timetable fits that (rows = slots, columns = days), so the printing and the Excel file need no new mechanism.
* The readiness list (`release/acceptance.json`, shown on the About page) already has "configuration pending" items such as the attendance sessions. The school's real times are the same kind of fact.

## 1. Database design — migration V10 (additive only)
Three new tables and three triggers. **No existing table is changed, rebuilt or back-filled, and no row is created: every school starts with an empty timetable and no time is invented.**
```sql
-- the school days of a year: a row = an enabled day (1 = Monday ... 7 = Sunday). No rows at all means the default Monday-Friday (the first change writes them).
CREATE TABLE timetable_days (
    academic_year_id INTEGER NOT NULL REFERENCES academic_years (id),
    day_of_week      INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
    PRIMARY KEY (academic_year_id, day_of_week)
);

-- the time slots of a year, typed by the school. A break (is_break = 1) is a shaded row that never holds a lesson.
CREATE TABLE timetable_slots (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    academic_year_id INTEGER NOT NULL REFERENCES academic_years (id),
    name_km          TEXT    NOT NULL,
    start_time       TEXT    NOT NULL CHECK (start_time GLOB '[0-2][0-9]:[0-5][0-9]'),
    end_time         TEXT    NOT NULL CHECK (end_time   GLOB '[0-2][0-9]:[0-5][0-9]'),
    is_break         INTEGER NOT NULL DEFAULT 0 CHECK (is_break IN (0, 1)),
    sort_order       INTEGER NOT NULL DEFAULT 0,
    version          INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT    NOT NULL,
    updated_at       TEXT    NOT NULL,
    UNIQUE (academic_year_id, name_km),
    CHECK (end_time > start_time)
);

-- one lesson: a class, a day, a slot, ONE subject and ONE teacher. A cell with only one of them cannot exist (both NOT NULL).
CREATE TABLE timetable_entries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id    INTEGER NOT NULL REFERENCES classes (id),
    slot_id     INTEGER NOT NULL REFERENCES timetable_slots (id),
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
    subject_id  INTEGER NOT NULL REFERENCES subjects (id),
    teacher_id  INTEGER NOT NULL REFERENCES teachers (id),
    version     INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL,
    UNIQUE (class_id, slot_id, day_of_week),    -- a class has one lesson per slot per day
    UNIQUE (teacher_id, slot_id, day_of_week)   -- a teacher is in one place at a time (slots of a year never overlap, see 2)
);
CREATE INDEX idx_timetable_entries_slot ON timetable_entries (slot_id);
CREATE INDEX idx_timetable_slots_year   ON timetable_slots (academic_year_id, sort_order);
```
Triggers (the database refuses what the service would, for any statement that bypasses the service): (a) the class and the slot of an entry belong to the **same academic year**; (b) the subject of an entry is a **main** subject (`parent_id IS NULL`); (c) the slot of an entry is **not a break**.

**Why this is enough for the morning / afternoon question the owner left open:** slots belong to the year, not to a grade. A class simply uses the slots it needs, and its view hides the slots it never uses (a switch shows them all while editing). Whatever arrangement the school confirms later fits without a schema change.

**Existing code that must change with it (small, listed so nothing is forgotten):** `ClassService.delete` removes the class's own timetable entries first (a class that was never used has no history to protect); `SubjectService.usedIds` / `isUsed` count `timetable_entries` (a subject a timetable uses is switched off, not removed); audit labels; the readiness list (item `timetable-slots`, below). **Not changed:** attendance, examinations, homework, backups, fees.

## 2. Validation rules
| Rule | Where it is enforced | Answer |
|---|---|---|
| A cell is saved only with **both** a subject and a teacher | UI (the Save button is off), API (`@NotNull`, 422 `REQUIRED`), database (`NOT NULL`) | 3 layers |
| Subject: a **main subject**, active, **offered to the class's grade** | service + trigger (b) | `SUBJECT_NOT_OFFERED` |
| Teacher: **active** | service | `TEACHER_INACTIVE` |
| One lesson per class, day and slot | `UNIQUE (class_id, slot_id, day_of_week)`; a second save to the same cell replaces it (an edit), never a duplicate | — |
| **A teacher cannot be in two classes at the same day and slot** | service first (so the answer can name the other class), `UNIQUE (teacher_id, slot_id, day_of_week)` as the last line | 409 `TIMETABLE_TEACHER_CLASH` with `className`, `dayOfWeek`, `slotName` |
| The day is a school day of the year; the slot belongs to the class's year and is not a break | service, triggers (a), (c) | `TIMETABLE_DAY_DISABLED`, `TIMETABLE_YEAR_MISMATCH`, `TIMETABLE_BREAK_SLOT` |
| Slot: name required (at most 50 characters) and unique in the year; times "HH:mm" 00:00–23:59, end after start | service + CHECKs | `REQUIRED`, `DUPLICATE`, `INVALID_TIME`, `END_TIME_BEFORE_START` |
| **Slots of a year do not overlap** (so a clash is a plain unique key) | service | `TIMETABLE_SLOT_OVERLAP` (a choice I made: say so if the school needs parallel groups) |
| School days: 1–7, at least one; a day that holds lessons cannot be removed | service | `TIMETABLE_DAY_IN_USE` |
| A slot that holds lessons cannot be deleted (rename or move it instead) | service + foreign key | `TIMETABLE_SLOT_IN_USE` |
| A **closed** academic year is read-only (slots, days, cells, copies into it) | service | 409 `ACADEMIC_YEAR_CLOSED` |
| Optimistic lock on a slot | `version` | `OPTIMISTIC_LOCK` |
| Copying (below) | service | `TIMETABLE_TARGET_NOT_EMPTY`, `TIMETABLE_YEAR_NOT_EMPTY`, `TIMETABLE_DIFFERENT_GRADE` |
| A teacher who is made inactive later keeps their lessons (history), shown marked "inactive"; changing that cell needs an active teacher | UI + service | — |

**Copying never touches a historical record.** It only **reads** the source (which may be a closed year) and writes only into the target, which must be open and empty. Between classes of the same grade the copy takes the **subjects** and fills each teacher from the **target class's own assignment** (never the source class's teacher, which would clash at once); a cell with no assigned teacher, or a clash, is **skipped and listed**, never saved half-filled. Between years it copies the school days, the slots and, for classes that exist in both years (same grade and name), the lessons; a teacher who is no longer active is replaced by the class's current assignment or the lesson is skipped and listed. A test compares the source rows byte for byte before and after.

## 3. API (all under `/api/v1`, all need a signed-in session; nothing leaves the PC)
| Method and path | What it does |
|---|---|
| `GET /timetable/settings?yearId=` | the year's school days (and whether they are still the default), its slots with how many lessons each holds, and whether the year is closed |
| `PUT /timetable/days` `{yearId, days:[1..7]}` | set the school days |
| `POST /timetable/slots` `{yearId, nameKm, startTime, endTime, isBreak}` | add a slot |
| `PUT /timetable/slots/{id}` `{…, version}` | change a slot |
| `PUT /timetable/slots/order` `{yearId, ids:[…]}` | reorder |
| `DELETE /timetable/slots/{id}` | delete an unused slot |
| `POST /timetable/years/{toYearId}/copy-from/{fromYearId}` | copy days, slots and lessons into an empty year; answers `{slots, lessons, skipped:[{class, day, slot, reason}]}` |
| `GET /timetable/classes/{classId}` | the class grid: days, slots, lessons, the subjects the class may use with their default teacher, and the teachers to offer (assigned first, then all active) |
| `PUT /timetable/classes/{classId}/cell` `{dayOfWeek, slotId, subjectId, teacherId}` | save one cell (a new lesson or a replacement) |
| `DELETE /timetable/classes/{classId}/cell?dayOfWeek=&slotId=` | clear one cell |
| `POST /timetable/classes/{classId}/copy-from/{sourceClassId}` `{replace}` | copy between classes of the same grade; answers `{copied, skipped:[…]}` |
| `GET /timetable/teachers/{teacherId}?yearId=` | the teacher's week across all classes (read-only) and the number of lessons |
| `GET /timetable/students/{studentId}?yearId=` | the timetable of the class the student is in (default: the current year); read-only, nothing is stored about the student |

Every change is written to the history of changes (slot created / changed / reordered / deleted, days changed, cell set / cleared with the **ids only**, copy done).

## 4. UI design
* **Side menu:** a new item **កាលវិភាគ** (Timetable) in the studies group, with the calendar-week icon. **Settings → កាលវិភាគ** for the days and the slots.
* **Settings → កាលវិភាគ:** the year picker; the school days as seven tick boxes (Monday–Friday ticked until changed; "Saturday" can be ticked); the slots as a list (name, start, end, "break" tick, up/down, delete) with an add form; "copy from the previous year" when the year is empty. The empty state says: *no times have been entered; enter the school's own timetable; the program never fills in times by itself.* A **"school has not confirmed"** notice (the same notice the attendance sessions use) stays until the administrator signs off the readiness item `timetable-slots`.
* **កាលវិភាគ page, three tabs:**
  1. **By class (the editor):** year and class pickers, then the grid.
```
              ច័ន្ទ        អង្គារ       ពុធ        ព្រហស្បតិ៍    សុក្រ
 07:00-07:45  គណិតវិទ្យា   ភាសាខ្មែរ    [ + ]       ...           ...
              គ្រូ ក       គ្រូ ខ
 07:45-08:30  ...
 ───── break ─────────── (shaded, no lessons) ───────────────────────
```
  Clicking a cell opens a small pop-up: **Subject** (the main subjects offered to the grade), **Teacher** (the class's assigned teachers first, the subject's own teacher already chosen; a switch "show all active teachers"); **Save stays off until both are chosen**; a clash is shown inside the pop-up, naming the other class; "Clear" empties the cell. Buttons: *show all slots* (the grid hides slots the class never uses), *copy from another class* (same grade, with the result list), *print*, *Excel*. A closed year shows the grid read-only with a notice.
  2. **By teacher:** year and teacher pickers, a read-only grid of subject + class, the number of lessons in the week, print, Excel.
  3. **By student is on the student's profile:** a card **កាលវិភាគ** with the grid of the student's class (read-only), print, Excel. (There is no separate student picker page; tell me if you want one.)
* **Printing and Excel:** three new reports (`timetableClass`, `timetableTeacher`, `timetableStudent`) through the existing one-table mechanism: A4 portrait, small type for seven columns, the same page header, "Save as PDF" and the Excel file. Landscape is not used (no other page in the program is landscape).
* **Small screens:** a table inside its own scrolling frame, cells about 110 px wide; five days fit at 1366×768 and at 125 % and 150 % scaling with the side menu collapsed; a Saturday/Sunday week scrolls inside the frame only, never the page. The layout suite (`e2e-layout.mjs`) already visits every menu page at those sizes and will include the new ones.
* **Offline:** no external font, script or address; Khmer labels are my own and go to `frontend/i18n/REVIEW.md` §19 for the native-speaker review.

## 5. Migration plan and risk review (for the owner to approve before any code)
1. **File:** `V10__timetable.sql` only. It creates the three tables, the two indexes and the three triggers. It does not read or write any existing row. Flyway runs it as it ran V8 and V9.
2. **Nothing is created for existing schools.** No slot, no day, no lesson: the timetable is empty and says so. The default Monday–Friday is a rule of the program, written only when someone saves something.
3. **Upgrade:** the program already makes a "before upgrade" backup before a migration runs (and stops if it cannot), so the first start on a school with data is protected.
4. **No way back:** a database at schema 10 cannot be opened by an older program (refused), as with V8 and V9. §17's unwritten migrations become V11 and V12.
5. **Proof, once built:** `MigrationV10Test` over a V9 school with homework, examination scores and backups (every existing row unchanged, `foreign_key_check` empty, the triggers and unique keys refuse what they should); a flow test for every rule in section 2; the unit tests of the grid and report tables; `e2e-timetable.mjs` in the real shell (settings starting empty, a lesson with and without a teacher, a clash, copy between classes and years with the source unchanged, the three views, one A4 page per printout, the Excel file accepted, a closed year read-only, 1366×768 at 100 / 125 / 150 %); the existing suites re-run.
6. **Not verified even then:** the school's real timetable (nobody has given it), a class of 40 with a full week of real names, physical printing, and use on the Dell laptop.

## 6. Small choices I made that you may change
* **Break rows** (`is_break`): proposed so a printed timetable can show a break; remove if not wanted.
* **Slots of a year never overlap.** Simple and safe; if the school runs two groups at the same clock time, say so.
* **Lessons use main subjects only**, like the teacher assignments. Sub-subject lessons would be a separate decision.
* **Student view on the profile**, not a separate page.
* **Portrait A4** for printing.

## 7. Information the school still has to give (never invented, never defaulted)
The real slot times and how many there are, the school days (Monday–Friday is only the starting tick), and whether some grades go in the morning and some in the afternoon. Until they are entered the timetable pages say "not configured"; the sample school does not get invented times.

## 8. The owner's decisions on this plan (2026-11-05) — implementation approved
**Design choices:** (1) break rows are included; (2) overlapping slots within an academic year are prevented, provided the school does not need simultaneous groups (if it does, this is reopened); (3) lessons use main subjects only; (4) the student's timetable appears on the student profile; (5) A4 portrait by default, **landscape printing is allowed when it is needed to keep a timetable readable**.

**Additional requirements and how the build meets them**
| # | Requirement | How |
|---|---|---|
| 1 | A clear empty / unconfigured state for a class with no timetable, not an application error | The grid and the views have their own empty states ("no times entered yet", "this class has no lessons yet"); the API answers 200 with an empty grid, never an error |
| 2 | Each teacher's total weekly lesson count | The teacher's view and print carry the count; it is also in the teacher's own page |
| 3 | A preview of copied and skipped lessons, with the reason for each skipped one, before any copy | The copy has two steps: a preview (changes nothing) and the copy; the preview lists copied lessons and every skipped lesson with its reason; copying a class and copying a year both work this way |
| 4 | Timetable changes recorded with the user and the timestamp in the audit history | Every change writes an audit entry (the audit trail already stores the signed-in user and the time); the history-of-changes page shows them with Khmer labels; a test checks the user and the time |
| 5 | Historical timetable records preserved when copying or changing academic years | A copy only reads its source and writes only into an open, empty target; a source year (closed or not) is never modified; a test compares the source byte for byte |
| 6 | Offline, and responsive at 1366×768 with 100 / 125 / 150 % scaling | No external resource; the grid scrolls inside its frame; the layout suite and the new real-app test cover those sizes |

**Implementation conditions:** no real school time, day or grade schedule is invented (the configuration stays empty until the school enters it); V10 is reviewed so that it changes no existing record; the unwritten scoring proposal (§17) and any unrelated database change are **not** part of this work; migration, backend, frontend and real-app tests are all written; the existing suites are re-run, including a look into the `e2e-honor` harness timeout; test results are recorded accurately in the progress documentation. **Installation, uninstall and reinstall tests (D22) and the final release installer are NOT done** until the owner gives separate explicit permission and the timetable and all approved changes are tested.

## 9. Built (2026-11-06) — what the build changed from this plan, and what it added
Sections 1–7 are the plan as it was shown to the owner; this section lists every place where the finished code differs from it, so nothing is a surprise.

**Database (V10).** Three tables as planned, **minus `sort_order`**: the slots of a year never overlap, so they have a natural order (by start time) and a second, editable order would only be able to contradict it. The planned reorder endpoint (`PUT /timetable/slots/order`) and the up / down buttons are therefore **not built**. The column that marks a break is `is_break` in the table and `breakSlot` in the API. **Three triggers**, as planned in number, but split differently: two on `timetable_entries` (insert, and update of the class, slot or subject) each refusing a class and slot of different years (`TIMETABLE_YEAR_MISMATCH`), a slot that is a break (`TIMETABLE_BREAK_SLOT`) and a subject that is not a main subject (`TIMETABLE_SUBJECT_INVALID`), and one on `timetable_slots` that refuses turning a slot that holds lessons into a break (`TIMETABLE_SLOT_IN_USE`). The time CHECK also refuses hours above 23. A third index (`idx_timetable_entries_subject`) was added for the "is this subject used" question. **V10 creates no row and touches no existing row**: `MigrationV10Test` runs it over a V9 school with teachers, assignments, students, an examination with scores, homework with records and compares **every table, definition and row, before and after**.

**API.** As planned, plus `GET /timetable/teacher-loads?yearId=` (the lesson count of every teacher, for the teacher picker). **Both copies take `preview`** (the owner's requirement 3); a request that leaves it out is a preview, so a request that forgets the flag changes nothing. The class copy also takes `replace`. `TIMETABLE_TARGET_NOT_EMPTY` is **not used**: without "replace" a class copy fills only the empty cells (an occupied cell is a skipped lesson, reason `CELL_OCCUPIED`); with "replace" it removes the target class's lessons first (the audit entry keeps their ids). A class copy is **between classes of the same grade and the same year** (another year is the year copy); `TIMETABLE_YEAR_MISMATCH` and `TIMETABLE_DIFFERENT_GRADE` refuse the others at `sourceClassId`. A year copy into a year that already has a slot or a lesson is `TIMETABLE_YEAR_NOT_EMPTY`; a source with no slot is `TIMETABLE_NOTHING_TO_COPY`. Skip reasons: \`SUBJECT_NOT_OFFERED\`, \`NO_TEACHER_ASSIGNED\`, \`TEACHER_INACTIVE\`, \`TEACHER_CLASH\` (with the other class), \`CELL_OCCUPIED\`, \`DAY_DISABLED\`, \`CLASS_NOT_IN_YEAR\`. A year copy replaces the target's school days by the source's (the default, with no rows, if the source never chose).

**Audit.** \`TIMETABLE_DAYS_CHANGED\`, \`TIMETABLE_SLOT_CREATED / UPDATED / DELETED\`, \`TIMETABLE_LESSON_SET / CHANGED / CLEARED\`, \`TIMETABLE_CLASS_COPIED\`, \`TIMETABLE_YEAR_COPIED\`; entity types \`timetable_slot\`, \`timetable_entry\`, \`class\`, \`academic_year\`. The summaries and the before / after values hold **ids, codes and times only** (a backend test fails on any non-ASCII character in them); the signed-in user and the time are added by the audit trail itself and shown on the history-of-changes page.

**UI.** The editor **draws every slot by default** (the plan hid the slots a class never uses until a switch was turned on, but then a row vanished the moment the first lesson was placed and the next lesson could not be added without finding the switch). The switch is still there, now to *hide* the unused slots; the readers (the teacher's tab, the student's card, the printouts) hide them automatically. Extra, not in the plan: a **card on the teacher's own page** with the weekly lesson count and the week (requirement 2 said "also in the teacher's own page"), a landscape switch **on the print page** rather than on the timetable page, and a \`back\` address in the print page's link so Back returns to the same class or teacher. The Settings page is called "ម៉ោង និងថ្ងៃសិក្សា" and sits in the Settings group of the side menu as "ម៉ោងកាលវិភាគ".

**Not built, as the owner excluded:** automatic generation, rooms, substitute teachers, weekly exceptions, examination timetables, any attendance integration. **Not built, and not asked:** a separate page to pick a student (the timetable is on the student's own page).

## 10. Verification (2026-11-06) — what was run and what it showed
Every line is a command that was run and whose output was read. **Nothing was installed, nothing was uninstalled, no school data was touched, and no installer was built** (the installer on disk is from 2026-11-05 and is stale: see `docs/PHASE6-PROGRESS.md`).

**The owner's requirements of section 8 and the proof of each**
| # | Requirement | Proof |
|---|---|---|
| 1 | A clear empty / unconfigured state, not an error | The API answers 200 with an empty grid (`BackendFlowTest` order 66: class, teacher, student, settings); the real app shows "no times entered yet" on the class page, the teacher tab, the student's page and the settings page, with no error alert (`e2e-timetable` TT-1a to TT-1d, TT-5c) |
| 2 | Each teacher's weekly lesson count | The teacher's tab, the teacher picker, the printout and the teacher's own page (TT-5a, TT-5d, TT-6f); `GET /timetable/teacher-loads` and the teacher view (order 66) |
| 3 | A preview of copied and skipped lessons, with the reason of each, before any copy | A preview changes nothing and leaves no history entry; a request without the flag is a preview; the copy button is off until a preview was looked at and a changed choice clears it; every skipped lesson shows its reason, a clash names the other class (order 66; TT-4a to TT-4e, TT-7b) |
| 4 | Changes recorded with the user and the time | Nine `TIMETABLE_*` actions; the backend test checks the user, the time and that the entries hold **no non-ASCII character** (ids only); the history page shows each with the user and a time in Khmer (TT-8a) |
| 5 | Historical records preserved when copying or changing years | A copy only reads its source: the source year's days, slots and lessons are **byte for byte equal** before and after a copy into a new year, and after it was closed and copied from (order 66; TT-7c, TT-7f) |
| 6 | Offline, and responsive at 1366×768 with 100 / 125 / 150 % | No external resource (the real-shell suite asserts only `app://school` and the local backend were contacted); the timetable page and its settings page never scroll the page sideways at Full HD and 1366×768 at 100 / 125 / 150 % (TT-9, six checks). Measured grid widths of a six-day week: 1570, 1186, 915, 1001, 910 and **728 px in a frame of 728** at 1366×768 and 150 % (the first version needed 789 and scrolled inside its frame by 61 px; the minimum widths were reduced). A seven-day week still scrolls **inside** the frame. |

**The implementation conditions**
* **No invented time, day or schedule:** V10 creates no row; `MigrationV10Test` shows the three tables empty after the migration of a V9 school with data; the sample-data seed was not changed; every time in the tests is an invented test value.
* **V10 changes no existing record:** `MigrationV10Test` compares **every table, its definition and every row** of a V9 school (teachers, assignments, students, enrollments, an examination with scores, homework with records) before and after, and the foreign-key and integrity checks are clean. It also proves the rules the database itself keeps (times, a unique lesson per class and slot, a teacher in one place, a main subject, no lesson in a break, one academic year, a slot with lessons cannot become a break).
* **The scoring proposal (§17) and unrelated database changes were not touched.** The only change outside the timetable's own files is the two small hooks named in §1 (`ClassService.delete`, `SubjectService.usedIds`), the report-table registry and the print page (the same mechanism as every report), and the readiness list.

**Results of the final run (00:50–00:56 on 2026-11-06, every step exited 0)**
| | |
|---|---|
| Backend, clean build | **157 run, 0 failures, 0 errors, 0 skipped** (152 before; +`MigrationV10Test` 2, `TimetableIndependenceTest` 2, `BackendFlowTest` order 66) |
| Frontend | type check clean; **464 / 464** unit tests (432 before; +32 in `timetable.test.ts`: the grid helpers, the three printed tables, the slot form's rules, **every API call's exact method, path and body**, and the independence scan) |
| Desktop unit tests | **26 / 26** |
| `e2e-timetable` (real Electron shell, real UI and backend) | **59 / 59**, also in the full regression run earlier the same day (59) |
| The existing real-shell suites | shell 30 · app 157 · changes 93 · honor 48 · ranking 51 · subjects 50 · lists 18 · homework 47 · backup 53 · layout 27 · **packaged 8 · hard kill 11** · **backup flow 40** (all ALL CHECKS PASSED / ALL PASSED) |
| Hand-over guide | exactly **one** A4 portrait page |

**What `e2e-timetable` measured that a screenshot would not:** the real PDF the real "Save as PDF" button writes is **one page** for the class, the teacher and the student, A4 **portrait** (594.96 × 841.92 pt) by default and A4 **landscape** (841.92 × 594.96 pt) when the switch is on, with the sheet 794 px / 1123 px wide on screen; Back returns to the same class, teacher or student; the Excel file the real button writes is a real zip that, unpacked, holds the lessons, the teachers, the slot labels (`07:00–07:45`) and the break.

**Things the tests found, and what was done** (nothing is left open): the editor hid every slot a class did not use as soon as the first lesson existed, so another lesson could not be added (**changed from the plan**: the editor now draws every slot by default, §9); the grid was too wide for a six-day week at 150 % on a 1366×768 laptop (minimum widths reduced); the rest were faults of the test itself (listed in `docs/PHASE6-PROGRESS.md`).

**Not verified, and not claimed:** the school's real days and times (nobody has given them: the readiness item `timetable-slots` stays "configuration pending" and Settings → Timetable says so); a class of 40 with a full real week and 30 teachers; **physical printing** (real PDFs and measurements only); the Excel files in **real Excel** (read back from the file); the **Dell laptop** (real scaling, speed, memory); Khmer typing in the slot and class forms; the **installed** program (D22); a native speaker's reading of the Khmer wording (`frontend/i18n/REVIEW.md` §19: the empty-state sentences and the skip reasons first). **One flaky behaviour in the round, unrelated to the timetable:** `e2e-honor` failed once with a screenshot timeout and then passed four times; the cause was not found.
