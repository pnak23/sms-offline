# Phase 3 progress log — academic operations

Rule (same as Phase 1 and 2): **PASS** means a command was run and its output observed. Anything else is TODO / NOT TESTED.
Approved 2026-10-31 (the Phase 3 decision list, with its proposed defaults). Built 3a → 3f in one run at the owner's request ("continue until it finish"); Phase 4 has **not** started. Nothing here is committed.

**Read this first:** the owner has not yet sent the school's real grading rules, a sample report card, or the answer to "morning / afternoon shifts?". Everything below that depends on them uses the approved *defaults* and is a placeholder (see "Defaults in use").

## Status
| Step | Status | Evidence |
|---|---|---|
| 3a Attendance (take, correct, history, printable summary) | PASS | backend steps 35–36 · real-UI checks P3-1…P3-11 |
| 3b Grading scales (bands, pass mark, one default) | PASS | backend step 37 · `GradingTest` · real-UI P3-12…P3-15 |
| 3c Examinations + subjects (maximum score, weight per grade) | PASS | backend step 38 · real-UI P3-16…P3-20 |
| 3d Score entry + results (weights, absent, incomplete, rank, pass) | PASS | backend step 39 · real-UI P3-21…P3-29 |
| 3e Report cards (A4, one per page, batch, PDF, teacher's comment) | PASS | backend step 40 · real-UI P3-30…P3-36b |
| 3f Homework | PASS | backend step 41 · real-UI P3-37…P3-39 |
| Closed-year freeze, student-deletion guard | PASS | backend step 42 (server only) |

**Final run, everything on this PC, after the last change:**
| Command | Result |
|---|---|
| `npm run backend:test` | **65/65** (50 at the start): `BackendFlowTest` is now a 42-step scenario (8 new Phase 3 steps) + `GradingTest` (7 new) |
| `npm run test -w frontend` | **211/211** (161 at the start) · `npm run typecheck -w frontend` clean |
| `node desktop/test/e2e-app.mjs` (real UI, real Electron shell, real backend) | **105/105** (59 at the start; 46 new checks) |
| `npm run e2e:ui` (Edge) | 32 steps passed, 0 failed, no layout / console / network findings |
| `node desktop/test/e2e-shell.mjs` | 30/30 |
| `node scripts/smoke-backend.mjs` | 19/19 |
| `node scripts/test-reset-admin.mjs` | 16/16 |
| `node scripts/smoke-export.mjs` | 4/4 on the full JDK **and** on the trimmed jlink JRE the installer ships |
| `npm run test:desktop` | 7/7 |
| `node scripts/build-all.mjs --dir --skip-tests` then `node desktop/test/e2e-packaged.mjs` | built; **8/8**: schema version 4 · ready in 5.6 s (twice; the very first run after a build took 14.8 s — antivirus scanning a new `.exe`, as in `CLAUDE.md`) · 593–600 MB idle (budget 800 MB) · bundled JRE 21.0.6, 50.1 MB |

## What exists now
**Database — `V4__academic_operations.sql` (done; from now on V4 is never edited, further changes go in V5):** `attendance_sessions` (unique class + date + shift), `attendance_records` (unique session + enrollment), `grading_scales` + `grading_scale_bands` (a partial unique index allows exactly one default; the migration seeds the standard scale), `examinations`, `examination_subjects` (unique exam + grade + subject), `student_scores` (score ×100, nullable; `is_absent`; a CHECK forbids "absent with a score"), `report_card_comments`, `homework`.

**Rules enforced on the server (each has a backend test):**
- Attendance: statuses Present / Absent / Late / Leave. The class list for a day is the students enrolled in the class on that day. Saving the same class + day again corrects in place and the audit trail keeps the old status (a status code only — no names, no remarks). A future day is refused (`FUTURE_DATE`); a closed academic year is frozen (`ACADEMIC_YEAR_CLOSED`); a student that is not on that day's list, a status that does not exist, or the same student twice is refused.
- Examinations: kinds Monthly / Midterm / Final / Other, name unique per year. A new one starts with every subject each grade studies, maximum 100, weight 1; both are editable per grade. A maximum cannot go below a score already entered. An examination or subject that has scores cannot be deleted (`EXAMINATION_HAS_SCORES`, `EXAM_SUBJECT_HAS_SCORES`).
- Scores: at most two decimals, from 0 to the subject's maximum. **Empty = not entered (not 0); "absent" is its own flag.** A changed score is a correction: the old value is kept in the audit trail (hundredths and a flag only).
- Results (computed on request, never stored): the percentage is the weighted sum of scores over the weighted sum of maximums, rounded half-up to 2 decimals; **absent counts as 0 and is flagged**; a student with any subject not entered has **no** percentage, band, pass or rank; tied students share a rank (1, 2, 2, 4); pass = percentage ≥ the scale's pass mark.
- Grading scales: 1–12 bands, each a minimum percent, a Khmer label and a letter; no two bands may share a minimum; one band must start at 0 so everybody falls into a band; exactly one default.
- Report-card data: the result above + the attendance summary from the academic year's first day to today (or its last day) + the teacher's comment (≤ 1000 characters; empty removes it; the audit trail says a comment was saved, never what it said).
- Homework: record-keeping only (class, subject, title, dates, status Given / Done / Cancelled); due date may equal, not precede, the given date; frozen in a closed year.
- A student with attendance or scores can no longer be deleted (they refer to the enrollment).

**UI (all Khmer):** Attendance (a roster with one button per status, "mark all present", a remark per student, history with per-student totals, a printable summary + PDF), Examinations (list, add / edit, subjects table with maximum and weight, score entry by class and subject, results table), Settings → Grading scale, Report cards (preview, comments, print one or the whole class), Homework (list, filters, add / edit, mark done / cancel / reopen). New sidebar group "ការសិក្សា" and one Settings entry.

## Defaults in use (replace when the owner sends the real rules)
1. One shift, stored as `DAY`. `classes.shift` stays hidden. (If the school runs two shifts, attendance must be reconsidered **before** real data is entered: the unique key is class + date + shift.)
2. Statuses Present / Absent / Late / Leave. 3. Roster = enrolled on the day.
4. Maximum 100, weight 1, both editable. 5. Absent counts as 0 in the total and average, and is flagged.
6. Incomplete result → no percentage / band / pass / rank. 7. Rounding half-up, 2 decimals. 8. Ties share a rank (1, 2, 2, 4).
9. Pass mark 50 %, editable. 10. Bands A–F: ល្អប្រសើរ 90 · ល្អណាស់ 80 · ល្អ 70 · ល្អបង្គួរ 60 · មធ្យម 50 · ខ្សោយ 0 — **editable, but the wording is a guess**.
11. Report card A4: school name + logo, student, subjects with maximum / weight / score, total, percentage, band, pass or fail, rank, attendance summary, teacher's comment, date, director's signature. **No MoEYS header and Arabic digits, as approved — but there is no setting yet to switch them on.** One card per page; the batch is one PDF.

## Found while testing (all fixed, each now has a check)
- **Stale maximum on the score sheet.** After editing a maximum on the Subjects tab, going back to Scores still validated against the old maximum (the sheet stays mounted while another tab is shown). The maximum is now derived from the examination's subject list. Found by the real-shell test; P3-21 (a score of 11 against a maximum of 10) is the guard.
- **Report card too tall.** With 10 subjects a card was ~23 mm longer than A4. Spacing was tightened; P3-36b measures a card with **12 subjects** (1003 px of a 1122 px page).
- **Attendance outside the academic year was silently not counted on the card.** The server accepts any past day; the card counts only the days of the year. The attendance page now warns ("the chosen day is outside the academic year…", P3-1b / P3-30b). It does not block.
- **Student lists were in database order.** Attendance, scores, results, the report-card list and both print pages now sort by Khmer name like the rest of the app (P3-1 compares against the Khmer collation, and the test names make sure that order differs from registration order).
- The shared `validation.INVALID_NUMBER` text said "enter a whole number"; scores have decimals, so it now says "enter a valid number".
- Backend, while writing: three `rs.wasNull()` evaluation-order bugs (see `CODE-TOUR.md` §3) — fixed before the first test run.
- The backend test originally used the PC's clock and a hard-coded year, which would have started failing after 2027-08-31; it now uses the test clock and re-dates the year around "today".

## What the tests drive through the REAL UI vs only on the server
- **Through the real UI:** take attendance, mark all present, a remark, save, reload from the database, correct a saved day, the unsaved-changes question (cancel keeps everything), history, the printable summary and its PDF; the default grading scale, a refused scale and a saved one, switching the default; add an examination, trim its subjects, edit a maximum and a weight (including a refused value); enter scores (refused values, absent, Enter moves down), results while incomplete and when complete (percentages, bands, ranks, the absent flag); report cards (preselected from the exam, a comment, print all, the card's content, a 3-page PDF, 12 subjects fit A4); homework add, mark done, filter.
- **Server tests only (no UI test yet):** editing an existing grading scale, changing an examination's name / dates, deleting an examination (and the refusal when it has scores), homework edit / cancel / reopen, the closed-year freeze (the buttons are disabled, but that was not clicked), student attendance and results endpoints (`GET /students/{id}/attendance`, `GET /students/{id}/results`) — **the student profile page does not show them yet**.

## Differences from the approved list
- Added: a non-blocking warning on the attendance page for a day outside the year (see above); a printable attendance **summary** (not a blank sheet to fill in by hand).
- Not built: a screen of printed results (only report cards print); the student profile does not yet show attendance or results; no setting for the MoEYS header or Khmer numerals.
- Results are listed by Khmer name, not by rank (the rank is a column).

## Findings, not changed (not approved)
- **Decision needed — results are recomputed from the *current* default scale.** If the school edits the bands or the pass mark later, the results (and therefore the report cards) of earlier examinations change too. A scale could be frozen per examination instead (a V5 column). Until then: do not edit the scale after cards have been handed out.
- A very long teacher's comment (the limit is 1000 characters) together with a card of 12 subjects can push the footer onto a second page; only the 12-subject card with a short comment was measured. Nine subjects with a 500-character comment is comfortable by arithmetic, not by measurement.
- Carried over from Phase 2, unchanged: Spring's "Using generated security password" line in `backend.log` (fix: exclude `UserDetailsServiceAutoConfiguration`); older request records with a primitive `boolean` answer 400 when the field is omitted (the UI always sends it); success toasts stack when many actions happen quickly; students in closed-year enrollments can still be marked inactive / graduated.

## Not verified
The school's real grading rules and report card (none were available) · Khmer keyboard (IME) typing in the new forms · **physical printing** (only PDF output and layout measurements) · a report card with a logo (the test school has none) · the installer (`scripts/test-installer.ps1` installs into your real profile, so it was **not** run; the NSIS installer was not rebuilt, only the unpacked app) · Windows 10 · a clean PC · an i3 / 8 GB machine · a class of 40 students on the entry sheets and a school of ~1,000 students (no timing measured; the test classes have 3 students) · concurrent use · the Khmer wording (AI-drafted, see `frontend/i18n/REVIEW.md` §8).
