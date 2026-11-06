# Phase 4 progress log — reports and administration

Rule (same as Phases 1–3): **PASS** means a command was run and its output observed. Anything else is TODO / NOT TESTED.
Approved 2026-10-31 (the 11-item Phase 4 list, with its proposed values). Built 4a → 4g in one run; Phase 5 has **not** started. Nothing here is committed.

**Read this first:** the report list below is *my proposal* (the original list in the master prompt was not re-read); fees are in riel only until you answer the currency question; the two national-header lines are typed from memory and must be checked against an official document before anything is printed with them.

## Status
| Step | Status | Evidence |
|---|---|---|
| 4a A grading scale frozen per examination (decision 1) | PASS | backend step 43 · real UI P4-47…P4-49 |
| 4b Dashboard figures and school events (decisions 2, 4) | PASS | backend steps 44–45 · real UI P4-1…P4-7 |
| 4c Reports: preview, A4 PDF, Excel (decisions 3, 5) | PASS | backend step 47 (Excel read back with POI) · real UI P4-13…P4-21 (Excel read back from the zip) |
| 4d Printed-report options: Khmer digits, national header (decision 6) | PASS | backend step 46 · real UI P4-8…P4-12 |
| 4e Optional fees: categories, charges, payments, receipts, voiding (decisions 7, 8) | PASS | backend steps 48–52 · `MoneyTest` · real UI P4-22…P4-46 |
| 4f Student profile: attendance and results cards (decision 9) | PASS | real UI P4-50 |
| 4g Performance budgets measured (decision 11) | PASS on this PC | `docs/PERF-LOG.md` (2026-10-31 section) |

**Final run, everything on this PC, after the last change:**
| Command | Result |
|---|---|
| `npm run backend:test` | **79/79** (65 at the start): `BackendFlowTest` is a 52-step scenario (10 new Phase 4 steps) + `MoneyTest` (4 new) |
| `npm run test -w frontend` | **253/253** (211 at the start) · `typecheck` frontend and desktop clean |
| `node desktop/test/e2e-app.mjs` (real UI, real Electron shell, real backend) | **155/155** (105 at the start; 50 new checks) |
| `npm run e2e:ui` (Edge) | 32 steps passed, 0 failed, no layout / console / network findings |
| `node desktop/test/e2e-shell.mjs` | 30/30 |
| `node scripts/smoke-backend.mjs` · `test-reset-admin.mjs` | 19/19 · 16/16 |
| `node scripts/smoke-export.mjs` | 4/4 on the full JDK **and** on the trimmed jlink JRE |
| `npm run test:desktop` | 7/7 |
| `node scripts/build-all.mjs --dir --skip-tests` then `node desktop/test/e2e-packaged.mjs` | built; **8/8** (twice): schema version 5 · ready in 5.6 s warm (15.6 s the first run after a build: antivirus scanning the new `.exe`) · 570–574 MB idle (budget 800 MB) · bundled JRE 50.1 MB |
| `node scripts/measure-reports.mjs` | see "Measured" below |

## What exists now
**Database — `V5__reports_and_fees.sql` (done; from now on V5 is never edited, further changes go in V6):** `examinations.grading_scale_id` and `grading_scales.archived`; `school_events`; `fee_categories`, `student_fees`, `fee_payments`. Examinations scored before V5 keep the scale that was the default when V5 ran.

**Rules enforced on the server (each has a test):**
- **A grading scale is frozen per examination.** The first score entered records the scale in use; results use it from then on, whatever happens to the default. Editing a scale that an examination already uses makes a **new** scale (it takes over as default if the old one was) and archives the old one, so old results and report cards never change; a replaced scale can be neither edited nor made default (`OPTIMISTIC_LOCK`). A scale nothing was graded with is edited in place.
- School events: title, a start day, an optional end day (not before the start), a note; the dashboard shows the next five.
- Dashboard: active students (boys / girls), active teachers, classes of the current year, today's attendance, the three latest examinations, upcoming events, and — only while fees are on — what is still due per currency.
- Report options (public settings): `report.khmerNumerals`, `report.moeysHeader`, `report.headerLine1–3` (≤ 100 characters, normalised, empty allowed), `fees.enabled`, `fees.currencies` (`KHR`, `USD` or `KHR,USD`). A request with any invalid key stores nothing.
- Excel: the UI sends the table it shows (title, column names with a type, rows); the server writes it with "Khmer UI" cells: text stays text (a phone number keeps its 0), numbers and dates are real, the header is frozen and filterable, the school's name heads the sheet. Bad shapes are refused (`rows:INVALID`, `columns:INVALID`).
- Fees: every call answers `409 FEES_DISABLED` while off (nothing is lost by switching off). Money is whole riel or cents with the currency on every record (`Money`): decimals the currency does not have, zero, negatives and absurd sizes are refused. Categories are never deleted (deactivated). A charge goes to an ACTIVE enrollment, in an open year, in an active category; "charge the whole class" skips whoever already has that category with that due date, so a repeat cannot double-charge. A payment cannot exceed what is due, cannot be dated in the future, gets the next receipt number of its year (`R-2026-00001`, gap-free, never reused) — and is **never deleted**: a mistake is voided with a reason. A charge with any payment, even a voided one, cannot be deleted; an amount cannot drop below what was paid. The audit trail names the receipt number and never the reason, a name or a reference.
- A closed academic year freezes fee **charges**; **payments and voids still work** (money owed does not vanish with the year).
- Fees owed by a student who **changed class or left** stay visible in the old class's fee overview (any enrollment with a charge is listed), and the dashboard figure agrees with that overview.

**UI (all Khmer):** Dashboard (four figures, current year, latest examinations, events with add / edit / delete, fees still due), Reports (six reports with their filters, preview, Excel), a generic printable report page, Settings → Printed reports (Khmer digits, national header with a live preview), Settings → Fees (switch, currencies, categories), Fees (class overview, a student's account, pay, void, edit, delete, class charge), printable receipt (a voided one is stamped VOID), student profile with attendance and results cards, grading page note about versions, scale name on the results table.

## Measured (full tables and caveats in `docs/PERF-LOG.md`)
On this PC (i5-10400F, 16 GB — **not** the i3 / 8 GB design point), 1,000 students in 25 classes: student list 12 ms (budget < 200), search 4 ms, saving attendance for 50 students 4 ms (budget < 500), dashboard 2 ms, 40 report cards 7 ms, a 1,000-row Excel 194 ms. The 40 report cards save as **exactly 40 PDF pages** in 0.7–1.0 s; memory peaked at **867 MB** (idle 671 MB) with a debugger attached, budget ≤ 1.2 GB.

## Found while testing (all fixed, each now has a check)
- **Fees of a student who changed class disappeared from the class overview** (found by thinking about transfers, not by a failing test): fixed and covered by backend step 52.
- **A bare lambda passed to `JdbcTemplate.query` is ambiguous to the IDE's Eclipse compiler**, which wrote a stub class into `target/classes`; Maven then reused it and the dashboard answered 401 inside the long scenario. Rewritten as a `RowMapper`; the trap is recorded in `CLAUDE.md`.
- The student-list report joined grade and class with " · " ("ថ្នាក់ទី១ · ក"); it now reads like the rest of the app ("ថ្នាក់ទី១ ក"). Caught by a unit test.
- A real-shell step clicked a menu link on a print page (which has no menu); and a Playwright helper left a response wait dangling when its click failed. Both fixed in the test.

## What the tests drive through the REAL UI vs only on the server
- **Through the real UI:** dashboard figures; add (with a refused end date), edit and delete an event; Khmer digits and the national header on a report card (and its PDF); all six reports' previews (results in rank and name order, student list, roster, attendance summary, teachers, fees), the results Excel read back from the zip, the results PDF; fees switched on, categories (Khmer digits typed, deactivate / activate, dollars), charging a class twice (no double charge), paying, an overpayment refused, voiding with a reason, both receipts and a 1-page receipt PDF, deleting a charge, editing a charge, a dollar charge beside riel, the fee report, the dashboard figure, switching off; editing the default grading scale and seeing the old examination keep its scale and pass mark; the profile cards.
- **Server tests only (no UI test yet):** editing a fee category through its dialog, paying in dollars (a dollar *charge* is covered), the closed-year fee states (buttons disabled), the "fees of a transferred student" overview, `FEE_HAS_PAYMENTS` and `BELOW_PAID` messages in the UI, the school-events list outside the dashboard, the other Excel reports (only the results Excel was read back; all use the same writer).

## Differences from the approved list
- Decision 1 (freeze) is implemented as **versions**: without archiving the old scale on edit, editing a used scale would still have changed old results.
- Fee payments and voids are allowed in a closed year (the list did not say).
- Receipts print on an A4 page (the top part is used); there is no half-sheet layout.
- Khmer numerals apply to **printed pages** only; Excel keeps real numbers. The student Excel export on the Students page stays as it was; the new "student list" report adds the PDF.
- The fee category's currency cannot change once something was charged in it.

## Findings, not changed (not approved)
- **The Excel file is the table the UI sends**, formatted by the server; the server cannot check that the rows are really the school's data (it formats whatever the signed-in user sends). The data came from the server a moment earlier, so the risk is only that a hand-crafted request makes a wrong sheet for that user.
- Confirmation dialogs show an empty name for a moment while they fade out (the item is cleared as the dialog closes). Cosmetic.
- The dashboard counts every ACTIVE student, including one not in a class this year.
- Carried over, unchanged: Spring's "Using generated security password" line in `backend.log`; older request records with a primitive `boolean` answer 400 when the field is omitted; success toasts stack when many actions happen quickly; students in closed-year enrollments can still be marked inactive / graduated; a long teacher's comment plus 12 subjects can push a report card onto a second page.
- The saved 40-card PDF was 290 KB the first time and 659 KB the next two with the same 40 pages (not investigated).

## Not verified
**Physical printing** of reports, report cards and receipts (only PDF output and layout measurements) · the Excel files opened in **real Excel** (only read back with POI and a zip reader) · the national-header wording against an official document · Khmer keyboard (IME) typing in the new forms · a card or receipt with the school's logo (the test school has none) · the installer (`scripts/test-installer.ps1` installs into your real profile, so it was **not** run; the NSIS installer was not rebuilt, only the unpacked app) · Windows 10 · a clean PC · an i3 / 8 GB machine (every timing above is for this PC) · concurrent use · the Khmer wording (AI-drafted, see `frontend/i18n/REVIEW.md` §9).
