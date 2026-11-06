# Release, identity and version management

Written 2026-11-01 (change round after Phase 5, approved by the owner). Nothing here needs the internet, at build time or at run time.

## 1. What the program is called, and who made it
One file holds it: **`release/release.json`**.

| Field | Value |
|---|---|
| `name` | Khmer Primary School Management System |
| `shortName` | KPSMS |
| `developer` | PHEA NAK (the developer / reference name) |
| `version` | 1.0.0 |
| `channel` | Stable |
| `copyright` | © 2026 PHEA NAK. All rights reserved. |

*History: the first specification (2026-11-01) gave the developer as "PHEA NAK"; the owner's later instruction of the same day gave "Nak" and "© 2026 Nak. All rights reserved."; **on 2026-11-06 the owner gave the full name "PHEA NAK" again**, and the file now holds "PHEA NAK" and "© 2026 PHEA NAK. All rights reserved.". Each change was one edit of this file followed by `node scripts/version.mjs sync` (which carries the name to the `author` of `desktop/package.json`; `check` fails while the two differ). The installer built on 2026-11-05 still shows "Nak" in its file properties: the next build shows "PHEA NAK".*

Everything that shows the name or the version is **derived** from this file. Nothing else contains a typed copy that a build depends on.
The Windows installer and data folder are the exception on purpose: the application id `kh.school.sms` and the data folder `%LOCALAPPDATA%\RuralSchoolManagement` are **not** renamed, so an upgrade finds the school's existing data (see §6).

## 2. Where it appears
| Where | How it gets the value |
|---|---|
| Sign-in and first-start screen | the backend's public `GET /api/v1/system/about`, loaded before anyone signs in |
| Sidebar footer (folded: just `v1.0.0`, the full name as its tooltip) | the same endpoint |
| Settings → About (name, short name, version, channel, developer, copyright, the technology it runs on, the database schema number) | the same endpoint, plus `GET /api/v1/system/info` (needs a session) and the Electron shell's own versions |
| Window title | built into the page title at `generate` time (`frontend/nuxt.config.ts` reads `release.json`) and into the Electron window titles at bundle time (`desktop/scripts/build.mjs` injects `__PRODUCT__`) |
| `backend.log` and `desktop.log` | one line at start-up: `KPSMS 1.0.0 (Stable) ready, database schema 9` / `starting KPSMS 1.0.0 (Stable) …` |
| Backup manifests (`manifest.json` inside every backup zip) | `product`, `channel` and `appVersion`; a backup made by a newer database schema is refused when read |
| Diagnostics export | the first lines of the text file |
| Windows installer file name and the Windows file properties of `KPSMS.exe` | `desktop/scripts/package.mjs` reads `release.json`: product name, company (`developer`), file and product version, copyright, `KPSMS-Setup-<version>.exe` |

## 3. One version, kept consistent
`release/release.json` is the only place a person edits the version. These copies are written from it by `node scripts/version.mjs sync` and checked by `node scripts/version.mjs check`:

* `package.json` (root), `desktop/package.json`, `frontend/package.json` (`version`; the desktop one also gets `author` = developer and `description` = name)
* `package-lock.json` (the root and the `desktop` workspace entry)
* `backend/pom.xml` (the project `<version>`, not the Spring Boot parent's)
* the Spring Boot jar reads `release.json` itself (it is copied onto the classpath as an extra Maven resource folder), so `ProductInfo`, `/system/about`, the log line and the backup manifest cannot disagree with it
* Electron's installer metadata is overridden at package time (`extraMetadata`), so a stale `desktop/package.json` can never reach the installer

How consistency is *enforced*, not just intended:
1. `node scripts/build-all.mjs` runs `version.mjs check` as its first step and stops if anything disagrees.
2. `desktop/test/version.test.mjs` (part of `npm run test:desktop`) checks the repository, proves that a drifting copy is reported by name and repaired by `sync`, that `set` touches only what it should, that CRLF files stay CRLF, and that only a semantic version is accepted.
3. `backend` test `ProductInfoTest` compares `ProductInfo` with the file; `BackendFlowTest` compares `/system/about` with it.
4. `frontend/tests/changes.test.ts` reads the same file.

### Commands
```
node scripts/version.mjs check          # exit 1 and a list of the files that disagree
node scripts/version.mjs sync           # write release.json's values into the other files
node scripts/version.mjs set 1.1.0      # change the version in release.json, then sync
npm run version:check                   # the same as the first line
npm run version:sync
```

## 4. Semantic versioning (MAJOR.MINOR.PATCH)
* **PATCH** (1.0.0 → 1.0.1): a bug fix, a wording fix, nothing a school notices as new, no new migration.
* **MINOR** (1.0.0 → 1.1.0): something new that does not change what exists: a new report, a new setting, a new migration that only adds. The school's data and settings keep working untouched.
* **MAJOR** (1.0.0 → 2.0.0): something the school must be told about before upgrading: a changed printed layout by default, a changed rule, a migration that rebuilds tables, a change of how backups or restores behave.
* A pre-release may carry a suffix (`1.1.0-rc.1`); the `channel` field says which line a build belongs to (`Stable` today).
* **The database schema number is not the program version.** It is the number of the last Flyway migration (`V7` → 7) and only ever goes up; it is shown separately on the About page and in the logs. A release can have the same schema number as the one before it, and a PATCH never adds a migration.

To make a release: `node scripts/version.mjs set <x.y.z>` → add the entry to `CHANGELOG.md` → `node scripts/build-all.mjs` (it checks, tests and builds) → keep the installer and its checksum.

## 5. The local information endpoints (no internet)
* `GET /api/v1/system/about` — public, no session: `{ name, shortName, developer, version, channel, copyright }`. It is what the sign-in screen needs before anyone has signed in, and it contains nothing private.
* `GET /api/v1/system/info` — needs a session: the same under `product`, plus the Spring Boot, SQLite, schema, Java and operating-system versions.
Both answer from inside the program. Nothing asks a server anywhere, and the program never checks for updates.

## 6. Updating never overwrites the school's data
* The data folder (`%LOCALAPPDATA%\RuralSchoolManagement`) and the application id are unchanged on purpose: the installer replaces the program files and nothing in the data folder.
* Before an existing database is migrated forward, an automatic `PRE_MIGRATION` backup is made and read back (Phase 5); if it cannot be made (no room on the disk, say) the upgrade does not run at all. A migration that fails rolls back, and the program stops with `MIGRATION_FAILED` and says so instead of starting on a half-changed database.
* Migrations are forward-only and never edited after release: V1–V5 belong to Phases 1–4, V6 is the sign-off table, V7 the attendance sessions (see `docs/PHASE0-ARCHITECTURE.md` §14).
* A database from a **newer** program is refused by the older program (`SCHEMA_NEWER_THAN_APP`), never opened.
* Settings, the logo and photos live in the data folder, not next to the program, so reinstalling or upgrading does not touch them.
* What is **not** yet verified: in Phase 1 the installer's install → run → uninstall → reinstall (data kept) passed on the development PC, but that was the old build; the current installer has not been built or run, an upgrade over an existing install has never been tried, and nothing has been tried on a clean PC (Phase 6, `docs/PHASE0-ARCHITECTURE.md` §15.5).

## 7. The readiness list and the school's sign-off
The program ships with a list of what is still pending before the school accepts it (`release/acceptance.json`, shown on Settings → About). A developer may only write two kinds of fact there: whether the work is **done** (`COMPLETED` / `IN_PROGRESS`) and what is still **pending** (`CONFIGURATION`, `OFFICIAL_INFORMATION`, `PHYSICAL_TESTING`). The fifth state, **Final school acceptance completed**, exists only as a row the administrator writes in the database (`acceptance_signoffs`, with a name and a date, audited, and it can be withdrawn). A build, a test or this file cannot create one: `scripts/lib/version.mjs` rejects an `acceptance.json` that claims it, and the build checks that.
Screens that depend on information the school has not yet confirmed (the grading rules, the national header, the fee currency, the attendance schedule, the report card layout) show a "not official yet" notice until the administrator signs the item off.

## 8. Files that carry release metadata (a checklist for a new version)
`release/release.json` · `package.json` · `desktop/package.json` · `frontend/package.json` · `package-lock.json` · `backend/pom.xml` · `CHANGELOG.md` · (derived, do not edit: the jar's `release.json`, the Windows file properties, the installer name).
