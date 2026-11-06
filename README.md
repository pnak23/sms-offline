# Khmer Primary School Management System (KPSMS) — offline, Windows desktop

One Windows PC, no internet needed. Electron shell + Nuxt 4 UI + Spring Boot 4.1 backend (Java 21) + SQLite.
Architecture and decisions: [docs/PHASE0-ARCHITECTURE.md](docs/PHASE0-ARCHITECTURE.md). Status and evidence: [docs/PHASE1-PROGRESS.md](docs/PHASE1-PROGRESS.md) … [docs/PHASE5-PROGRESS.md](docs/PHASE5-PROGRESS.md) and, for the change round after Phase 5, [docs/CHANGE-ROUND-PROGRESS.md](docs/CHANGE-ROUND-PROGRESS.md). What the school still has to confirm or test on real hardware: [docs/FINAL-SCHOOL-ACCEPTANCE.md](docs/FINAL-SCHOOL-ACCEPTANCE.md). Name, version and release rules: [docs/RELEASE.md](docs/RELEASE.md) · [CHANGELOG.md](CHANGELOG.md). How the code fits together: [docs/CODE-TOUR.md](docs/CODE-TOUR.md). Measurements: [docs/PERF-LOG.md](docs/PERF-LOG.md).

```
backend/    Spring Boot 4.1.x, Java 21, SQLite + Flyway          (Maven wrapper, no global Maven needed)
frontend/   Nuxt 4 SPA (Khmer UI), built to static files
desktop/    Electron shell: starts/stops the backend, serves the UI over app://school, installer
release/    release.json (the one name + version) and acceptance.json (what is still pending)
scripts/    build, measurement and test helpers
spikes/     throw-away proofs (S2) kept as evidence
docs/       architecture, progress, performance log
```

## Everyday commands (PowerShell, repo root)
| Task | Command |
|---|---|
| **A fictional sample school to try the program on** (72 invented students, 7 classes, three weeks of attendance with partial days, 2 exams, homework, events, fees in riel and dollars, and a DEMO Grade 3 subject configuration with sub-subjects labelled "(គំរូ)", which is not the school's curriculum; its own folder `.sample-data`, your real data is never touched) | `npm run sample:seed` (add `-- --fresh` to rebuild it), then `npm run sample:start`; sign-in details in `.sample-data/SAMPLE-LOGIN.txt` |
| Version and identity: check / repair / change | `npm run version:check` · `npm run version:sync` · `node scripts/version.mjs set 1.1.0` (edits `release/release.json`, see docs/RELEASE.md) |
| Backend tests | `npm run backend:test` |
| Build backend jar | `npm run backend:build`, then `node scripts/extract-backend.mjs` |
| Backend smoke test (lifecycle) | `npm run smoke:backend` |
| Run backend for UI work | `node scripts/dev-backend.mjs --fresh` |
| UI tests / type-check / build | `npm run test -w frontend` · `npm run typecheck -w frontend` · `npm run generate -w frontend` |
| Desktop type-check / bundle | `npm run typecheck -w desktop` · `npm run build -w desktop` |
| Shell end-to-end test (Electron + backend) | `node desktop/test/e2e-shell.mjs` |
| **Real UI in the real shell** (rebuild first: `backend:build` + extract, `generate -w frontend`, `build -w desktop`) | `node desktop/test/e2e-app.mjs` |
| **The change round in the real shell** (same rebuild first): the full-width layout, identity and version everywhere, the readiness list and sign-off, attendance sessions, the report card template, a 12-subject card on one A4 page | `npm run e2e:changes` |
| **The roll of honour in the real shell** (same rebuild first): the top 5 and top 10 in rank order, ties, the twenty artwork styles each on one A4 page (counted in the real PDF), and the real printed text laid over the real artwork pixel by pixel (the artwork never touches a name, a rank or any other printed line), every class of the year, the worst case with the national header and Khmer digits | `npm run e2e:honor` |
| **The monthly ranking list in the real shell** (same rebuild first): the page, every student in the backend's own rank order with ties and an incomplete result, the grade colours, the figures under the table against the backend's, a class of 45 students on two A4 pages (counted in the real PDF), every class of the year, the saved default (texts, font style, column headings) and Back, Khmer digits, notifications not printed | `npm run e2e:ranking` |
| **Subjects with sub-subjects in the real shell** (same rebuild first): the subject list and grade table, an examination's structure and its freeze, scores typed at the sub-subject level, the totals counting main subjects only, the report card with and without the sub-subject detail, and an existing examination staying byte for byte the same after a rename | `npm run e2e:subjects` |
| **Paged lists in the real shell** (same rebuild first): Students, Teachers and Classes shown a page at a time (10 / 20 / 50 / 100 / all), every row on exactly one page, a new search or filter starting at page 1, a teacher or class just added shown on its own page, the page size kept while the program is open | `npm run e2e:lists` |
| **Homework marks in the real shell** (same rebuild first): a homework about a sub-subject, "has a score" and its maximum, the students' statuses, marks and remarks, the class average, clearing a record, what may not change once marks exist, the student's homework history, the three homework reports (preview, the real PDF is one page, the Excel export), and the examination results and report-card data staying byte for byte the same | `npm run e2e:homework` |
| **The weekly timetable in the real shell** (same rebuild first): it starts empty and says so, the school days and the slots typed through the form (a wrong time and an overlap refused), a lesson that needs a subject and a teacher, a clash that names the other class, replacing and clearing a cell, copying a class after a preview, the teacher's week and lesson count, the student's week on the student's page, A4 portrait and landscape (the real PDF is one page each, with its page size), Back, the Excel file, a new year taking over another after a preview with the source year unchanged, a closed year read-only, the history of changes with the user and the time, and 1366×768 and Full HD at 100 / 125 / 150 % | `npm run e2e:timetable` |
| **The dashboard in the real shell** (same rebuild first; its own scratch copy of the fictional sample school): the figures on screen while the charts are still loading, a school with no year and no student (an honest empty state in every chart), the hero, every chart equal to the API's answer, "show as table", the keyboard and a tap, a day nobody recorded drawn as a gap (never zero), students of unknown gender kept in the totals, a class with no capacity, two currencies never combined, no year, a failed load with "try again", no animation for reduced motion and on the Low-memory preset, no sideways scrolling at Full HD and 1366×768 at 100 / 125 / 150 %, nothing stored in the browser | `npm run e2e:dashboard` |
| **Is the final build possible? (read-only, builds nothing)**: Node, the release metadata, JDK 21 with jlink, Maven, the packager's tools cached offline, the icon and the owner's logo, free disk space, nothing running, the stale installer untouched, and the sources against the snapshot (`--snapshot` to fingerprint them, `--compare` to list what changed since). The final installer itself is on hold: see `docs/RELEASE-BUILD-RUNBOOK.md` | `npm run release:preflight` |
| **Taking in a Khmer wording review**: `export` writes the reviewer's sheet; `apply <corrections.json>` is a dry run (before / after, every problem) and with `--write` changes only the corrected texts of `km.json` and writes the outcome report | `npm run khmer:review -- export` / `npm run khmer:review -- apply <file>` |
| **The packaged program killed hard and started again** (Phase 6, step 8, no installation: it runs `desktop/release/win-unpacked/KPSMS.exe` with a temporary data folder, so build the installer first with `node desktop/scripts/package.mjs nsis`): the "running" marker is left behind, the next start recovers and says so, the recorded pupil is still there, a backup made afterwards is proved good, a normal quit leaves no warning | `npm run e2e:killed` |
| **Window sizes in the real shell** (Phase 6, step 9; make a fictional school first with `node scripts/seed-sample-data.mjs --dir <a new folder>`): all 26 pages at the logical workspaces of the school laptop (14-inch Full HD at 100 %, 125 % and 150 % Windows scaling), of a 1366×768 laptop at the same three scalings, and at the smallest window (880×440): no sideways scrolling, no scroll bar on the page itself, the side menu collapsing and opening by itself | `node desktop/test/e2e-layout.mjs <folder>` |
| **Backups and restore in the real shell** (same rebuild first): create, copy to another drive, damage, change, restore, undo, audit viewer, performance page, exit prompt, restore on a new PC | `npm run e2e:backup` |
| Backups and restore against the real jar, no UI (upgrade backup, backup on close, restore applied at start-up, a crash after confirming) | `npm run test:backup-flow` (needs the extracted jar) |
| Browser walkthrough in Edge | `npm run e2e:ui` |
| Forgot the password and the recovery key (developer only, app closed) | `node scripts/reset-admin.mjs` · test: `npm run test:reset-admin` |
| Excel export works on a given Java (try the trimmed JRE: `desktop\build\jre\bin\java.exe`) | `node scripts/smoke-export.mjs [java.exe]` |
| Minimal JRE for the installer | `node scripts/build-jre.mjs` |
| Installer | `node desktop/scripts/package.mjs nsis` (or `dir` for an unpacked app) |
| Packaged-app test / installer test | `node desktop/test/e2e-packaged.mjs` · `powershell -File scripts/test-installer.ps1` |
| Start-up / memory measurement | `node scripts/measure-app.mjs` · `node scripts/measure-startup.mjs` |
| API times on 1,000 students and the memory peak of a 40-card report PDF (rebuild first, see above) | `node scripts/measure-reports.mjs` |
| What the memory presets cost and save (backend under four JVM settings, then the whole app idle per preset and graphics switch) | `npm run measure:presets` |

## Environment notes for this PC
- JDK 21 is found via `JAVA_HOME` or `C:\Users\<you>\.jdks\corretto-21.0.6` (no system change needed).
- If a shell has `ELECTRON_RUN_AS_NODE=1` (VS Code's terminal does) Electron starts as plain Node and shows no window — the test scripts clear it; clear it yourself before `electron .`.
- npm 11 blocks dependency install scripts by default; Electron's binary is fetched with `node node_modules/electron/install.js`.
- The `e2e:*` scripts do not rebuild anything: run the three build commands above first, or they test stale output.
- `python` may be a Windows Store placeholder that hangs; the project's tools use Node.
- User data lives in `%LOCALAPPDATA%\RuralSchoolManagement` (never in the install folder). Developer runs use `.dev-data/` (git-ignored) or `SMS_DATA_DIR`.
