# Phase 2 progress log — core school management

Rule (same as Phase 1): **PASS** means a command was run and its output observed. Anything else is TODO / NOT TESTED.
Approved 2026-10-31 (the 13-item list). Built 2a → 2f in one run at the owner's request ("continue until it finish"); Phase 3 has **not** started. Nothing here is committed.

## Status
| Step | Status | Evidence (command → result) |
|---|---|---|
| 0 This PC + baseline + fixes + offline reset tool | PASS | JDK 21.0.6 (signed by Amazon) in `~/.jdks`, `npm ci`, Electron binary · baseline before any change: backend 33/33, frontend 135/135, smoke 19/19, `e2e:app` all · `test:reset-admin` 16/16 |
| 2a Academic setup (years, subjects, grade × subject, preferences page) | PASS | see below |
| 2b Teachers | PASS | |
| 2c Classes + subject teachers | PASS | |
| 2d Students + guardians + photos | PASS | |
| 2e Enrollment, transfer, leaving, promotion | PASS | |
| 2f Search, Excel student list, printable profile | PASS | |

**Final run, everything on this PC, after the last change:**
| Command | Result |
|---|---|
| `npm run backend:test` | **50/50** (33 at the start) — `BackendFlowTest` is now a 34-step scenario over real HTTP on a real SQLite file |
| `npm run test -w frontend` | **161/161** (135 at the start) · `typecheck` frontend + desktop clean |
| `node desktop/test/e2e-app.mjs` (real UI, real Electron shell, real backend) | **59/59** (21 at the start): wizard, academic setup, preferences, teachers, classes, students, duplicate warning, photo, Excel, transfer, promotion, print + PDF, lock, sign-out, no external requests, no CSP violations, no console errors |
| `npm run e2e:ui` (Edge, 32 steps) | **32/32**, no layout / console / network findings |
| `node desktop/test/e2e-shell.mjs` | 30/30 |
| `node scripts/smoke-backend.mjs` | 19/19 |
| `node scripts/test-reset-admin.mjs` | 16/16 |
| `node scripts/smoke-export.mjs` | 4/4 on the full JDK **and** on the trimmed jlink JRE the installer ships (POI works there) |
| `node scripts/build-all.mjs --dir --skip-tests` then `node desktop/test/e2e-packaged.mjs` | built; **8/8**: schema version 3, starts in 7.3 s, 592 MB idle (budget 800 MB) |
| `node scripts/build-jre.mjs` | 50.1 MB (49.6 MB before Excel support) |

## What exists now
**Database — `V3__people_and_classes.sql` (done; from now on V3 is never edited, further changes go in V4):** `grade_subjects`, `teachers`, `classes`, `teacher_assignments`, `students`, `guardians`, `enrollments`. A student has at most one ACTIVE enrollment per academic year (partial unique index); a class is unique per year + grade + name. `classes.shift` exists but is never shown (the owner has not said whether the school runs shifts).

**Rules enforced on the server (each has a test):**
- Teachers are deactivated, never deleted; an inactive teacher cannot be chosen as homeroom or subject teacher.
- A class is frozen in a closed academic year; it can be deleted only if nobody was ever enrolled in it. Going over capacity is a **warning** (`CLASS_OVER_CAPACITY`), never a block.
- Subject teachers: one per class + subject; the subject must be active and studied by the class's grade.
- Students: Khmer name + gender + date of birth are required. Same normalised Khmer name + date of birth = `409 POSSIBLE_DUPLICATE` (with the existing code) that the user confirms. Codes `2026-0001` (numbering restarts every year, gap-free, a refused request burns no number); teachers `T-001`.
- A student can be deleted only when nothing ended (no promotion / transfer / leaving) **and** no record refers to the enrollment; the foreign keys are the real guard (proved with a stand-in table).
- Transfer = the old enrollment is closed as `CHANGED_CLASS` and a new one opened (same year); leaving = `LEFT` + the student becomes inactive; marking inactive / graduated ends the current enrollment.
- Promotion: everything is validated **before** anything is written, so a request is applied completely or not at all; `dryRun` (the default) writes nothing; running it twice cannot duplicate (a closed enrollment is no longer ACTIVE). Outcomes PROMOTED (next grade) / REPEATED (same grade) / GRADUATED (grade 6 only, student becomes graduated).
- Excel: made by Apache POI, "Khmer UI" font, real date cells, phone numbers kept as text; the Khmer column titles come from the UI (the server has no user-facing text).
- Photos: decoded and re-encoded as JPEG ≤ 512 px under a generated name; the deep health check reports missing and orphaned photos.

**UI (all Khmer):** Students (search by name / code / guardian name or phone, filters, Excel export, profile, edit, photo, enrol / transfer / leave, mark inactive / graduated, delete, printable profile + PDF, promotion screen), Teachers (list, search, profile with classes, add / edit / deactivate), Classes (by year and grade, subject teachers, roster, enrol students), Settings → Academic and General settings (from 2a).

## 2a — academic setup (details)
Years: add, edit (optimistic lock), make current, close, reopen (a closed year is read-only; closing the current year leaves no current year). Subjects: add, rename, activate / deactivate; codes `SUBJ-001`… from `SequenceService`. Grades: `PUT /grades/{id}/subjects` replaces the set of subjects a grade studies; a new subject starts out offered to every grade. Settings → Academic has years, subjects and a grade × subject table; Settings → General settings is the wizard's preferences step reused (so preferences are finally editable after the wizard).

## Offline reset tool (`node scripts/reset-admin.mjs [--data-dir DIR] [--password-stdin] [--force]`)
Developer-only (`tools/ResetAdmin.java` lives outside `backend/src/main`, so it cannot end up in the installer). Close the app first. One transaction: new password (same BCrypt cost and policy as the app), the old recovery key replaced by a random one nobody sees, key marked unconfirmed (so the app makes the owner create and print a **new** key at the next sign-in), failed-attempt counters cleared, an audit entry. It never prints a password or a key. It refuses while `config/running.lock` exists unless `--force`.
It differs from the approved wording in one way: it does **not** print a new key itself — the app's forced-key screen can only show a key it generated, so a key printed by the tool could never be confirmed.
Found by its own test: Java's launcher turns non-ASCII command-line arguments into `?` on Windows, so a Khmer-named data folder cannot be passed as an argument; it travels in `SMS_DATA_DIR`.

## What the tests drive through the REAL UI vs only on the server
- **Through the real UI:** teacher add / search with Khmer digits / deactivate / reactivate; class add (two grades, two years); subject teacher saved and read back; student registration with guardian + class; duplicate confirmation; list search and class filter; Excel export; photo upload; class transfer; promotion preview and apply; print sheet + PDF.
- **Server tests only (no UI test yet):** deleting a student or a class from the UI, "leave school", "mark inactive / graduated" and "reactivate" buttons, the over-capacity warning toast, editing a class, the enrol-a-student picker on the class page, the graduation outcome in the promotion screen.

## Differences from the approved list
- The reset tool does not print a recovery key (see "Offline reset tool" below).
- Grade renaming dropped; "reopen year" added; `GET /grades` now carries `subjectIds`.
- The Excel export is a `POST /students/export` (the Khmer labels travel in the body); `POST /enrollments/{id}/leave` and `DELETE /classes/{id}` were added because the rules above need them.
- Promotion works one class at a time.

## Findings, not changed (not approved)
- Spring Boot prints **"Using generated security password"** to `backend.log` at start-up (its default in-memory user; harmless because form/basic login are disabled, but it is a password-looking line in a log that should hold none). One-line fix: exclude `UserDetailsServiceAutoConfiguration`.
- **Jackson 3 answers 400 (not 422) when a request leaves out a primitive `boolean` field.** New student requests use boxed `Boolean`; the older `makeCurrent` / `active` / `primary` fields are still primitive. The UI always sends them, so users never see it.
- Success toasts stack in the middle of the page when many actions happen quickly (5 s each, top-centre). Existing Phase 1 behaviour.
- Students whose enrollment is in a closed year can still be marked inactive / graduated (a student-level action).

## Not verified
Khmer keyboard (IME) typing in the new forms · physical printing of the student profile · the installer test (`scripts/test-installer.ps1` installs into your real profile, so it was **not** run; the NSIS installer was not rebuilt) · Windows 10 · a clean PC · an i3 / 8 GB machine · lists of ~1,000 students (no timing measured) · concurrent use · the Khmer wording (AI-drafted, see `frontend/i18n/REVIEW.md` §6–7).
