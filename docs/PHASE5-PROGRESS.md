# Phase 5 progress log — reliability: backups, restore, history of changes, performance

Rule (same as Phases 1–4): **PASS** means a command was run and its output observed. Anything else is TODO / NOT TESTED.
Approved 2026-11-01 (the 12-item Phase 5 list, with its proposed values). Built 5a → 5g in one run; Phase 6 has **not** started. Nothing here is committed.

**Read this first:**
- **The Low-memory preset turned out to be a small effect** (measured, `docs/PERF-LOG.md`): about 13 MB less just after start and nothing at idle after a minute, a peak 20–70 MB lower under heavy use, and the heaviest burst about 20 % slower. Switching graphics off saves about 28 MB of the ~590 MB the app uses at idle. The page says exactly this. You may prefer to drop the preset; it costs nothing to keep.
- **A restore also restores that backup's user name, password and recovery key** (they live in the database). The restore dialog says so in Khmer; the safety backup taken first keeps the credentials you had before.
- **Backups are not encrypted** (as proposed, item 7). The backup page says so and advises a Windows password and keeping the USB stick safe.
- **No real USB stick was tested.** "Another drive" in the tests is a folder on drive E: (the repository) while the data lives on C:. Pulling a stick out mid-copy, a read-only stick and a full stick were not tried.
- **A weakness found, not fixed:** 8 heavy requests at once can answer HTTP 500 (database busy for 5 s). See "Findings".

## Status
| Step | Status | Evidence |
|---|---|---|
| 5a Backup file: snapshot, manifest, SHA-256, read back before it is named; history file; rotation; the last good backup is protected (decisions 1, 5) | PASS | `BackupArchiveTest` (11) · `BackupStoreTest` (12) · backend steps 53, 56 · real jar |
| 5b Restore: stage, confirm, applied **before the database opens**, safety backup first, survives a cut at any point; automatic backups on close and before an upgrade (decisions 2, 6) | PASS | `RestoreBootstrapTest` (11, with a crash at every step) · backend step 54 · `scripts/test-backup-flow.mjs` against the real jar |
| 5c Audit viewer (read only) and log rotation (decisions 8, 9) | PASS | backend step 55 · `AuditReadOnlyTest` · `LogRotationTest` · real UI P5-10 |
| 5d Electron side: copy to a folder with a hash proof, pick a zip, exit prompt, presets, `desktop.log` rotation (decisions 3, 4, 10) | PASS | `desktop/test/backups.test.mjs` · `e2e-backup.mjs` |
| 5e Khmer UI: backup page, restore dialog, exit prompt, closing overlay, audit page, performance page, wizard "restore from a backup" (decisions 3–6, 8, 10) | PASS | `e2e-backup.mjs` (48 checks) · screenshots checked by eye |
| 5f Health check additions (decision 11) | PASS | backend steps 53 and 56 · real UI P5-12c |
| 5g Presets measured before chosen (decision 10) | PASS on this PC | `docs/PERF-LOG.md` (2026-11-01) |

**Final run, everything on this PC, after the last change:**
| Command | Result |
|---|---|
| `npm run backend:test` | **120/120** (79 at the start of Phase 5): `BackendFlowTest` is now 56 steps (4 new), plus the new unit classes |
| `npm run test -w frontend` | **275/275** (253 at the start) · `typecheck` frontend and desktop clean |
| `npm run test:desktop` | **15/15** (7 at the start) |
| `node desktop/test/e2e-backup.mjs` (new; real UI, real shell, real backend; two apps) | **48/48**, four runs in a row after the last fix |
| `node desktop/test/e2e-app.mjs` (the earlier phases, real UI) | **155/155** (unchanged: nothing from Phases 1–4 broke) |
| `npm run e2e:ui` (Edge) | 32 steps passed, 0 failed, no layout / console / network findings |
| `node desktop/test/e2e-shell.mjs` | 30/30 (the "only the documented bridge" check now lists the 18 members) |
| `node scripts/test-backup-flow.mjs` (new; the real jar started and stopped six times) | **40/40** on the full JDK, on the trimmed jlink JRE **and** on the packaged jar with its bundled JRE |
| `node scripts/smoke-backend.mjs` · `test-reset-admin.mjs` · `smoke-export.mjs` | 19/19 · 16/16 · passed on the JDK and on the trimmed JRE |
| `node scripts/build-all.mjs --dir --skip-tests` then `node desktop/test/e2e-packaged.mjs` | built; **8/8** twice: schema version 5, ready in 6.1 s warm (12.8 s the first run after the build: antivirus), 582 MB idle |

## What exists now
**No new migration.** The backup history is a file (`config/backup-history.json`), because a restore replaces the database and history inside it would be overwritten by the backup being restored. V1–V5 are still final.

**Backups (`backup/`).**
- A backup is `SchoolBackup_YYYY-MM-DD_HH-mm-ss.zip` holding `school.db` (made with `VACUUM INTO`, a consistent snapshot of the live WAL database; never a raw copy), the student photos, the school logo and `manifest.json` (program and schema version, SHA-256 and size of every entry). It is written as `.part`, **read back as a stranger would** (zip structure, every hash, the database opened read-only: `integrity_check`, `foreign_key_check`, schema version) and only then gets its name.
- Reading a zip is defensive, because it may come from a USB stick: entry names must match a fixed pattern (no `..`, no drive, no stray file), exactly the entries the manifest lists, sizes bounded while streaming (a zip bomb stops at the declared size), a database of a **newer** schema is refused whatever the manifest claims (the database inside is the truth).
- Manual backups live in `backups/`, automatic ones in `backups/auto/` and are rotated: the newest 10 made when the program closes, 5 made before an upgrade, 3 made before a restore. Manual ones and **the last verified backup are never removed**; a file this program did not make is never rotated away. A backup found damaged stays listed, marked damaged, and stops counting as "the last good one".
- Copy to a USB stick / folder: the shell shows the folder dialog, copies, and **compares the SHA-256 of the copy with the original's** (a mismatch deletes the copy). Only then does the page tell the backend, which accepts the hash only if it equals the one it recorded. A copy on the **same drive letter** as the data is made and verified but **not counted** as "elsewhere"; the program's own data folder is refused as a destination.
- Reminder: "the last copy elsewhere is older than N days" (default 7), counted from the last such copy or from when the history began. Shown as the dashboard banner (now with a link), on the backup page, and as a question when the window is closed.

**Restore.**
- Choose a file (or a backup already in the list) → the backend checks it completely and unpacks it into `backups/restore-pending/` → the dialog shows what it holds (date, counts of students / teachers / classes / photos, size) and warns in Khmer → **only the user's yes** marks it confirmed → the backend restarts and `RestoreBootstrap` applies it **before the database is opened**.
- Order: re-verify the unpacked files → safety backup of what is about to be replaced (skipped on a new installation with no account: nothing to protect; if the current database is too damaged to back up, its files are **kept** in `backups/replaced_*`) → move the current files aside → move the backup's files in → clean up. A journal (`START → CURRENT_MOVED → DONE`) lets the next start either finish the clean-up or put the original files back; an interrupted restore never leaves half of each.
- A backup from an older schema is restored as it is and migrated forward by Flyway as usual (which makes its own pre-upgrade backup first). One from a newer program is refused when it is chosen.
- Also reachable from the setup wizard's first screen, before any account exists (a new or reinstalled PC); those three endpoints are open only while no administrator exists.
- The restored database writes `RESTORE_APPLIED` into its own audit trail at its first start; the backup page shows how the last restore ended.

**Automatic backups, no timers.** One when the program closes if the newest backup is more than a day old (the shutdown answer says so, and Electron then waits up to 3 minutes instead of 10 seconds while the page shows "saving a backup…"); one before any upgrade migration (**if it cannot be made, the upgrade does not run**). Neither depends on anyone being signed in.

**Audit viewer.** Settings → "ប្រវត្តិសកម្មភាព": newest first, filters by day (the PC's calendar), action, person and kind of thing, paged by id. Action and entity codes are Khmer (`i18n.test` fails if a code is added without a label); the English technical sentence is shown small as the detail. Read only: `AuditReadOnlyTest` fails if a mutating endpoint or an update/delete method is ever added.

**Logs.** `backend.log` and `desktop.log` roll at 10 MB and keep five older files (`.1` newest), uncompressed (a person helping over the phone can open them in Notepad). Boot's own rolling policy counts days, not files, so `logback-spring.xml` spells it out.

**Performance page.** Two settings, written to `config/app.json` and applied at the next start (the page offers to restart): the preset (Standard = the RAM tiers as before; Low-memory = 192 MB heap, a 32 MB start and tighter heap sizing) and "reduce graphics" (hardware acceleration off). The page cannot reach anything else in that file: the patch schema is strict, a hand-typed heap or port survives, a broken file falls back to safe defaults.

**Health.** `BACKUP_AGE` is now about the copy elsewhere (it was the age of the newest zip); new `BACKUP_SPACE` (room for the next backup) and, in the deep check, `BACKUP_VERIFY` (the newest backup really opens).

**Menu.** Three new entries under Settings: backups, history of activity, speed and memory.

## Measured
See `docs/PERF-LOG.md` (2026-11-01). Summary on this PC (i5-10400F, 16 GB, 1,000 students): single requests 7–15 ms under every setting; whole app idle 593 MB (Standard) / 595 MB (Low-memory) / 565 MB (graphics off). Making a backup of a small test school and verifying it takes well under a second (the shutdown with a backup took 614 ms).

## Found while testing (all fixed, each now has a check)
- **Logback's size trigger is gated by a time interval** (`checkIncrement`, minutes by default in 1.5), so a burst could write 136 MB into one file before the first look. Set to 1 second; `LogRotationTest` reproduced it first.
- **The restore dialog's facts list was unstyled** (one line per term and value, pushing the buttons off screen): found by looking at the screenshot, not by a check. Fixed.
- **Modals were always in the page** (hidden): an existing generic `.modal-content` locator matched two elements. Both new modals now render only while shown (`lazy`).
- The existing Edge walkthrough asserted "the restore button is disabled" and its mock bridge lacked the new members; `e2e-shell`'s "only the documented bridge" list pinned the old 11 members. All updated (that check is what keeps the privileged surface from growing unnoticed).
- Test-only mistakes, not product bugs: an operator-precedence slip, locators bound to the first window being reused for the second app, a check that read the second academic year before the list had loaded (intermittent: it passed once and failed once before I fixed it), a fixture whose migration-history table had 4 columns instead of Flyway's 10, `LATEST` a string against a number.
- **Mutation checks** (the new tests can fail): skipping the rollback's clean-up broke the crash sweep at the step that matters; dropping the "exactly the entries the manifest lists" check broke the stray-entry test; skipping the re-verification before applying broke the damaged-staged-file test. All three were put back.

## Findings, not changed (not approved)
- **Eight heavy requests at once can answer HTTP 500** (`GET /report-cards/data` in the measurement) after waiting 5 s for the database. Every transaction begins `IMMEDIATE` (SQLite's write lock; deferred mode failed under concurrent writers in Phase 1), so parallel heavy requests queue behind each other. It is not a memory effect (same at 512 MB and 192 MB; one run had none). Three clients at once, which is more than one school PC does, never produced an error. A fix would touch the transaction mode of the whole program, so it needs your decision.
- Errors raised by the web server itself (a 405 for the wrong method, a 404 for an unknown address) come back as **401** because the internal error page is not authenticated. Nothing in the app sends such requests; the audit test accepts it.
- When a restore is applied, the program's own start also makes a "before upgrade" backup if the restored data is from an older schema: two extra backups in `backups/auto/` (rotated like the others).
- Closing the window asks the page only while someone is signed in; with nobody signed in it closes directly (a backup is still made on close if one is due, because that is done by the backend).
- Carried over, unchanged: Spring's "generated security password" line in `backend.log`; older request records with a primitive `boolean` answer 400 when the field is omitted; success toasts stack when many actions happen quickly.

## Differences from the approved list
- Item 2: rotation is **per kind** (10 automatic, 5 before an upgrade, 3 before a restore) so a daily backup can never push out the one made before an upgrade; the list said "keep the last 10" for the automatic ones only. A failed pre-upgrade backup **stops the upgrade**. No automatic backup is made while no account exists yet.
- Item 3: a copy on the same drive letter is reported but not counted; the program's own data folder is refused.
- Item 5: a backup can also be restored straight from the list (that is how the safety backup undoes a restore).
- Item 6: a new installation with no account gets no safety backup (nothing to protect); a database too damaged to back up is kept in `backups/replaced_*` rather than deleted.
- Item 8: the detail column shows the English technical sentence in small type; it is not translated (the codes are).
- Item 9: "keep 5" means five older files, exactly; the live file may pass 10 MB briefly if a burst writes thousands of lines within one second.
- Item 10: the measured effect of the preset is small (above); 192 MB is the smallest heap tried that finishes everything, and also the lowest the program allows.
- Item 11: `BACKUP_AGE` changed meaning (copy elsewhere).

## What the tests drive through the REAL UI vs only on the server
- **Through the real UI (`e2e-backup.mjs`):** the empty page; creating a backup; copying to another drive (hash equal, recorded) and to the same drive (not counted); refusing the program's own folder; a damaged file marked damaged and deleted; the last good backup protected; changing the school; the restore dialog (what it holds, the three warnings) and its confirmation; the restart, the "restored" notice, signing in, the old school back; the restore recorded and the safety backup listed; the audit page (newest entry, filters, an invalid range refused, nothing editable); **undoing the restore** from the list; the overdue banner and its link; the deep health check; the performance page writing `app.json`; the exit question (stay, then copy-and-quit with the copy proved); a **restore on a new PC from the first wizard screen**; closing with a backup made while it closes.
- **Server / unit / real-jar only:** every refusal of a bad zip (not a zip, cut short, flipped bit, wrong checksum, newer schema, stray or path-like entries, a broken database), the crash sweep, rotation, the history file, setup-mode access, the audit paging and filters in detail, the upgrade backup, the backup on close, a crash between confirming and restarting.
- **A school with no students was used in the UI restore test**: the restored counts there are 0. Rows and photos round-trip byte for byte in `BackupArchiveTest` / `RestoreBootstrapTest` (real photos, WAL database, Khmer-named folder) and the real-jar test (a logo file), not through the UI.

## Not verified
A **real USB stick** (removable media, unplugging mid-copy, a read-only or full stick) · a **full disk** while backing up or restoring (`BACKUP_DISK_SPACE_LOW` is only checked by an estimate) · the **refusal to upgrade when the pre-upgrade backup cannot be made** (the code is one `catch`; it was not provoked) · antivirus holding a file during the swap (the move retries five times; never exercised) · a **big school**: closing with a gigabyte of photos (the on-close backup took 614 ms for the test school), a restore of a backup of ~1,000 students with photos through the UI · Windows shutting down while the on-close backup runs · the installer (`test-installer.ps1` installs into your real profile, so it was not run; the NSIS installer was not rebuilt, only the unpacked app) · Windows 10 · a clean PC · an i3 / 8 GB machine (every timing is for this PC) · Khmer keyboard typing in the new forms · the Khmer wording (AI-drafted, `frontend/i18n/REVIEW.md` §10).

## Update 2026-11-05: local backups are now the primary method (the owner's decision)
Nothing in this phase's backup, restore, rotation or verification was removed. What changed is what the program SAYS and WARNS about, so that the backups on the laptop are the school's primary protection and a copy on a USB stick is optional: the health check `BACKUP_AGE` is now about the local backups (a warning when there is none that is good, or the newest good one is 24 hours old or more; shown on the dashboard in every state; since 2026-11-06 the green state is a quiet one-line status with an information button, see `docs/CHANGE-ROUND-PROGRESS.md`, tenth round), the optional USB reminder is off by default, and the Backup page and the dashboard state that a backup kept on the laptop does not protect against a failed SSD, theft or physical damage. The reasons, the ten requirements, what was already met and what was added are in `docs/PHASE0-ARCHITECTURE.md` §19.
