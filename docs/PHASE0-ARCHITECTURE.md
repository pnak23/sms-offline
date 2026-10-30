# Phase 0 — Architecture & Plan
**Offline Khmer Primary School Management System (Windows desktop)**
Status: **APPROVED (2026-10-30): Spring Boot 4.1.x on Java 21, and all nine defaults in §12. Phase 1 in progress — see `docs/PHASE1-PROGRESS.md`.**
Date: 2026-10-30

**Changes in revision 4** (your approval message)
- **D1 decided: Spring Boot 4.1.x on Java 21** (option B). Newest stable 4.1 patch is **4.1.2** today (no 4.1.3; 4.2 is only at RC1); Phase 1 re-resolves it before any code (§13).
- **S2 (SQLite persistence + migrations) is now a hard gate**: no backend scaffolding until it passes on the then-latest 4.1.x patch (§11).
- Clarified that internet is used **only at build time on the developer PC**; the installed app has no internet dependency (§8).
- **The nine defaults (§12) are explicitly NOT yet approved.**

**Changes in revision 3** (your review requests)
- **D1 re-opened → §2A**: official support status, dependency comparison, a compatibility probe run on both Spring Boot lines, and a recommendation. **You need to pick the line.**
- **Windows**: Windows 11 64-bit is the recommended production OS; Windows 10 22H2 is a compatibility test target with stated limits → §4C.1a, D22, R19.
- **§12**: the nine defaults are numbered, each with its reason.
- **Probe-driven corrections** (true on either Boot line): `transaction_mode=IMMEDIATE` is required (§5.1, R3); type converters are mandatory (§5.1, R2); **my earlier `defer_foreign_keys` table-rebuild pattern was wrong and is replaced** (§5.4, R4); SQLite constraint errors need a custom translator (§6.1); UTF-8 stdout flags (§4C.3).

**Changes in revision 2**: D8 resolved into the full account / recovery-key design (§4A); first-launch wizard (§4A.3); health check (§4B); hardware, budgets and JVM configuration (§4C); ERD, endpoints, data dir, preload API, restore behaviour, risks, checklist and open questions updated.

---

## 0. How to read this document

| § | Content |
|---|---------|
| 1 | Environment inspection (what exists, what is missing) |
| 2 | **Decisions & deviations from the master prompt** — read this first |
| 2A | **Spring Boot version decision — decided: 4.1.x** |
| 3 | Repository structure |
| 4 | Electron + Nuxt + Spring Boot integration |
| 4A | **Authentication, first-launch wizard, recovery key** *(new)* |
| 4B | **Application health check** *(new)* |
| 4C | **Target hardware, performance budgets, configuration** *(new)* |
| 5 | SQLite design (ERD, constraints, conventions) |
| 6 | API contracts |
| 7 | Local data directory |
| 8 | Windows packaging strategy |
| 9 | Khmer language strategy |
| 10 | Technical risks |
| 11 | Implementation checklist |
| 12 | Decisions recorded, defaults you can veto, what is still open |
| 13 | **Approval request** |

Anything marked **[verify]** is a hypothesis that will be proven by a Phase 1 spike. Nothing in this document has been tested yet.

---

## 1. Environment inspection

### 1.1 Findings (dev machine)

| Item | State | Note |
|---|---|---|
| OS | Windows 11 Pro 10.0.26200, x64, 31.7 GB RAM | `D:` has 134 GB free |
| Project dir | `D:\My Own Project\sms-offline` — empty (only `.qodo/`) | **Not a git repo** — `git init` in Phase 1 |
| Node | 24.22.1 (via nvm4w; also 22.x, 26.x available) | Nuxt 4.6 needs `^22.22.3 \|\| ^24.15.0 \|\| >=26` → OK |
| npm / pnpm / yarn | 11.19.1 / 12.15.0 / yarn 1.x | Proposal: **npm workspaces** (no extra tool) |
| Java | **Not on PATH, `JAVA_HOME` unset** | But **Corretto 21.0.6 exists** at `C:\Users\pnak\.jdks\corretto-21.0.6` with `jlink`, `jdeps`, `jmods` ✔ |
| Maven / Gradle | Not on PATH | Use the **Maven Wrapper** (`mvnw`) — nothing to install. IntelliJ's bundled Maven 3.9.x can generate the wrapper once |
| Git | 2.48.1 | |
| Khmer fonts | Dozens installed incl. Noto Sans Khmer, Khmer OS family | ⚠ **Masks font-bundling bugs** — see R14 |
| Printers | Epson WF-7830, Canon (network), Microsoft Print to PDF | Enough to test real + virtual printing |
| Winget | Present | Could install a system JDK/Maven if wanted — not required |

### 1.2 Actions needed on the dev machine
1. Set user env var `JAVA_HOME=C:\Users\pnak\.jdks\corretto-21.0.6` (one line; build scripts will also fall back to that path).
2. Nothing else to install. No Docker, no global Maven.
3. For Phase 6 testing: a **clean Windows environment without Khmer fonts, Java, or Node and with networking disabled** (Windows Sandbox if the feature is enabled, otherwise a Hyper-V VM).

### 1.3 Current library versions (looked up 2026-10-30, to be pinned exactly in Phase 1)

| Area | Choice | Version |
|---|---|---|
| Frontend | Nuxt / Vue / Bootstrap / BootstrapVueNext | 4.6.3 / 3.5.x / 5.3.8 / 1.2.2 |
| State, forms | Pinia (+`@pinia/nuxt` 1.0.3), vee-validate, **zod** | 4.1.0, 4.15.1, **3.x (not 4)** — see D2 |
| Other FE | Day.js (has `km` locale ✔), Iconify, ApexCharts + vue3-apexcharts, `@nuxtjs/i18n` | 1.11.23, 5.0.4, 8.6.0 / 1.11.3, 10.6.0 |
| Fonts (bundled) | `@fontsource/noto-sans-khmer`, `noto-serif-khmer`, `battambang`, `moul` (all OFL) | 5.3.0 |
| Desktop | Electron / electron-builder / esbuild | 45.1.0 / 26.18.0 / 0.28.2 |
| Backend | **Spring Boot 4.1.x (decided, D1 = B)** — newest stable today 4.1.2: Spring Framework 7.0.10, Hibernate 7.4.13, Flyway 12.4.0 | §2A |
| SQLite | `org.xerial:sqlite-jdbc` — managed by Boot 4.1.2 at **3.53.4.0** (no override needed) | 3.53.4.0 |
| Excel | Apache POI (`poi-ooxml`) | 5.5.1 (6.0.0 is out; choose in spike) |

TypeScript 7.0.2 is the newest on npm; **pin to whatever `vue-tsc`/Nuxt's template supports** rather than `latest` [verify].

---

## 2. Decisions & deviations from the master prompt

These are the places where I either refine the prompt or recommend against a literal reading. **D1 is decided (Boot 4.1.x, §2A); D8 is resolved; D17–D22 are new. The nine review defaults are in §12.**

| # | Decision | Why |
|---|---|---|
| **D1** | **Decided 2026-10-30: Spring Boot 4.1.x on Java 21** — newest stable 4.1 patch at Phase 1 start (4.1.2 today) | Only line with free support today (to 2027-07-31); the Phase 0 probe passed 12/12 on both 3.5.16 and 4.1.2; migration debt is cheapest on an empty repository (§2A). |
| D2 | **zod 3.x, not zod 4** | `@vee-validate/zod@4.15.1` (latest) has peer `zod ^3.24.0`. Zod 4 would break form validation. Schemas shared with `toTypedSchema`. |
| D3 | **PDF and printing use Chromium (Electron), not a Java PDF library** | Khmer needs complex-script shaping (coeng/subscript consonants, vowel reordering) and dictionary-based word breaking. Chromium has HarfBuzz + ICU for this; OpenPDF/iText/PDFBox/OpenHTMLtoPDF do not shape Khmer reliably. Reports are Vue "print" pages → `webContents.printToPDF` / `webContents.print`. Spring only supplies JSON data, so *Spring remains the only DB accessor*. Proven in spike S1 before anything depends on it. |
| D4 | **Random loopback port + per-launch secret**, not a fixed port | A fixed port can collide, and any web page in a browser can fire requests at `127.0.0.1:<port>`. The backend picks port `0`, reports the real port to Electron, and rejects any request lacking the secret that Electron injects (§4.4). A fixed port remains available via `config/app.json`. |
| D5 | **Decimals as scaled integers; dates as ISO text** | SQLite has no true DECIMAL/DATE. Scores stored ×100 (`INTEGER`), money in minor units (`INTEGER` + `currency`). Dates `YYYY-MM-DD`, timestamps ISO-8601 UTC. Averages/ranks computed in Java with `BigDecimal`, never SQL floats. JPA `AttributeConverter`s. |
| D6 | **History hangs off `enrollments`, not `students`** | Attendance, scores and fees reference the *enrollment* (student × academic year × class). Promotion creates a new enrollment; old records are never touched. A mid-year class change = close old enrollment + open new one. |
| D7 | **Student "grade / class / academic year" live on the enrollment**, shown as part of the student profile | Normalised; the prompt's field list is satisfied in the UI and API (`currentEnrollment`). |
| **D8** | **Decided & specified in §4A**: user-created admin (own username + password) via a first-launch wizard; one-time recovery key, stored only as a hash, rotated on every use; no default or universal credentials | With no email/online auth, a forgotten password otherwise means a locked-out school. |
| D9 | **Backup history stored outside the database** (`config/backup-history.json`) | A restore replaces `school.db`; history inside it would be overwritten by the very backup being restored. |
| D10 | **Restore is applied at next backend start**, before the DB is opened | Never swap a DB file under a live connection pool. Flow in §4.7. |
| D11 | **Spring writes backups only into the managed `backups/` dir**; Electron's main process copies to/from the USB/folder the user picked | Keeps arbitrary filesystem paths out of the REST API. Renderer never sends paths to Spring. |
| D12 | **Load Nuxt through a custom `app://` protocol**, not `file://` | Absolute asset URLs and history-mode routing just work; gives a stable origin for CORS/CSP. |
| D13 | **Client-side Khmer sorting** (`Intl.Collator('km')`) for lists/rosters; server paginates only large tables (logs, history) | JDK `Collator` has no reliable Khmer tailoring and SQLite sorts by code point. A small school's lists are tiny. Verified in S1 [verify]. |
| D14 | **Walking-skeleton installer in Phase 1**, not Phase 6 | Packaging bugs (JRE paths, process spawn from `resources/`, AV, install dir) are cheapest to find on day one. Phase 6 then hardens, not discovers. |
| D15 | **Maven (wrapper), npm workspaces, esbuild for Electron main/preload** | Fewest moving parts. Sandboxed preload scripts must be one bundled CJS file. |
| D16 | **Vue i18n via `@nuxtjs/i18n`**, locale `km` default, single `km.json` tree | Meets "centralised translations, English later". Backend returns error *codes*; the frontend owns all Khmer text. |
| D17 | **The setup wizard gates the whole app** until the admin account exists; setup progress is stored in the DB, not browser storage | Nobody can configure or read data before an owner exists; an interrupted wizard resumes after login (§4A.3). |
| D18 | **Recovery key = 25 chars Crockford Base32 (125 bits, `SecureRandom`), BCrypt-hashed**; using it rotates it in the same transaction | Unguessable, easy to copy by hand (no `I L O U`), invalid the instant it is used (§4A.2). |
| D19 | **Password max 72 UTF-8 bytes** (BCrypt's limit) with a clear Khmer message, instead of silent truncation | A Khmer character is 3 bytes in UTF-8, so ≈ 24 Khmer characters; ASCII gives 72. |
| D20 | **Health check in three layers with no background polling** (§4B) | Needed for "friendly startup error" and for support, without adding timers or services. |
| D21 | **JVM memory configurable** through `config/app.json`, RAM-tiered defaults, validated bounds; no Windows service, tray, auto-start, updater or timers (§4C) | Unknown target PC; measure, then tune without rebuilding. |
| D22 | **Windows 11 64-bit is the recommended production OS; Windows 10 22H2 is a compatibility test target** with documented limits (§4C.1a) | Windows 10 is outside regular Microsoft support since 2025-10-14, and Chromium's Windows 10 plans are unconfirmed. It stays supported on a best-effort, VM-tested basis because older i3 PCs often cannot run Windows 11. |

---

## 2A. Spring Boot version decision (D1 — decided: option B, 4.1.x)

You asked me to verify the support status and recommend the best line — not simply the newest patch. This section is evidence first, recommendation last.

### 2A.1 Official support status
Source: Spring's own project API, `https://api.spring.io/projects/spring-boot/generations`, fetched 2026-10-30 (the data behind spring.io's support table). Latest releases checked on Maven Central the same day.

| Generation | Released | **Free (OSS) support ends** | Paid (commercial) support ends | Status today |
|---|---|---|---|---|
| 3.5.x | 2025-05-31 | **2026-06-30** | 2032-06-30 | **Free support ended four months ago.** 3.5.16 is the newest 3.5 on Maven Central. |
| 4.0.x | 2025-11-30 | 2026-12-31 | 2027-12-31 | Ends in two months — not a sensible target. |
| **4.1.x** | 2026-06-30 | **2027-07-31** | 2028-07-31 | **The supported line today.** 4.1.2 is the newest. |
| 4.2.x | 2026-11-30 (planned) | 2027-12-31 | 2028-12-31 | Only `4.2.0-RC1` on Maven Central — not yet released. |

### 2A.2 What each line brings (read from the published Boot BOMs)
| | Boot **3.5.16** | Boot **4.1.2** |
|---|---|---|
| Java | baseline 17; **21 ✔** | baseline 17; **21 ✔** |
| Spring Framework / Security | 6.2.19 / 6.5.11 | 7.0.10 / 7.1.2 |
| Hibernate ORM | 6.6.53.Final | 7.4.13.Final |
| `hibernate-community-dialects` (SQLiteDialect) at that version | exists ✔ | exists ✔ |
| Flyway; SQLite support inside `flyway-core` | 11.7.2 ✔ | 12.4.0 ✔ |
| sqlite-jdbc | 3.49.1.0 — override needed for 3.53.x | **3.53.4.0 managed** |
| HikariCP / Tomcat | 6.3.3 / 10.1.55 | 7.0.2 / 11.0.27 |
| Jackson | 2.21.x | 3.1.x (new package names) |
| Flyway dependency | `flyway-core` | `spring-boot-starter-flyway` (Boot 4 splits starters into modules) |

### 2A.3 Compatibility probe (throwaway, outside your project; not Phase 1 code)
One small Maven project, identical sources and tests, built twice (Boot 3.5.16 and Boot 4.1.2) on Corretto 21.0.6 with sqlite-jdbc 3.53.4.0, Hibernate's community `SQLiteDialect` and Flyway. It lives in my scratchpad; I can copy it to `docs/evidence/` if you want it kept.

| Result | Boot 3.5.16 | Boot 4.1.2 |
|---|---|---|
| Tests passed | **12 / 12** | **12 / 12** |
| Flyway V1 + V2 (table rebuild with data and a referencing table) | ✔ | ✔ |
| `IDENTITY` ids, Khmer round-trip (23 code points), `LIKE` search | ✔ | ✔ |
| `foreign_keys=1`, `journal_mode=wal`, `busy_timeout=5000` on all 4 pooled connections | ✔ | ✔ |
| `VACUUM INTO` backup: `integrity_check = ok`, data present | ✔ | ✔ |
| Spring context start (one run, includes test infrastructure — **not a benchmark**) | 5.5 s | 5.9 s |

**Four findings that apply to either line** (they changed this document — §5.1, §5.4, §6.1):
1. **Default date storage is unsafe.** Without a converter, a `LocalDate` was stored as an INTEGER of epoch milliseconds shifted by the PC's time zone (`1525107600000` for 2018-05-01 on UTC+7). With explicit converters: `TEXT '2018-05-01'`, `TEXT '2026-10-30T08:15:30Z'`, `INTEGER 725`.
2. **Concurrency needs `transaction_mode=IMMEDIATE`.** Four threads running read-then-write transactions: default (deferred) mode failed **72 and 78 of 100** with `SQLITE_BUSY` despite `busy_timeout`; IMMEDIATE failed **0**.
3. **My earlier Flyway rebuild pattern was wrong.** `PRAGMA defer_foreign_keys=ON` + drop/rename of a *referenced* table failed at commit (`FOREIGN KEY constraint failed`) on both lines. What passed: Flyway on its own connection with foreign keys OFF, plus a pure-SQL assertion at the end that aborts the migration on any violation (proved on a deliberate orphan row).
4. **SQLite enforces UNIQUE / FOREIGN KEY / RESTRICT, but Spring does not recognise the codes** — it throws `JpaSystemException` / `UncategorizedSQLException`, not `DataIntegrityViolationException`. The app needs a small translator.

*Not covered by the probe:* Spring MVC/Jackson, Spring Security, validation, Apache POI, jlink packaging. S2/S3 will exercise those on whichever line you choose.

### 2A.4 Options
| Option | For | Against |
|---|---|---|
| **A. Boot 3.5.16** | Your earlier preference; most field time; probe 12/12 | **No free fixes since 2026-06-30** and none coming; a later move to 4.x means Jackson 3, Security 7, Hibernate 7, modular starters across a *finished* codebase; needs a sqlite-jdbc override |
| **B. Boot 4.1.x** (recommended) | Free support to **2027-07-31**; probe 12/12 — same functional result as A; managed sqlite-jdbc 3.53.4.0; greenfield is the cheapest moment to be on 4.x; a later 4.1 → 4.2 bump is a *minor* upgrade | 4.1 is four months old and Hibernate 7's SQLite dialect has less field time (it passed our probe, but I have not seen it under real load); fewer answers online; needs a yearly minor-version bump to stay in support |
| C. Boot 4.2.x | Longest support (to 2027-12-31) | Not released yet — start on B and bump after 4.2 GA |

### 2A.5 Recommendation and decision
**Choose B: Spring Boot 4.1.x on Java 21** — the newest 4.1 patch at Phase 1 start, moving to 4.2 after its release.

Why, in order of weight:
1. **It is the only line with free support today** (3.5: ended; 4.0: ends in two months).
2. **The "stability" argument for 3.5 is not borne out where it matters here**: the same tests pass identically on both, for exactly the SQLite/Hibernate/Flyway combination this project depends on.
3. **Migration debt is cheapest now.** The repository is empty; moving later costs far more than choosing 4.x today.
4. Java 21 works on both; Flyway's SQLite support is unchanged; sqlite-jdbc 3.53.4.0 comes managed.

This is a **judgement, not a test result** — both options pass. A is a defensible choice if you prefer the older, longer-proven line and accept that it will never get a free fix; the loopback-only design keeps its practical exposure low. **Decision (2026-10-30): B — Spring Boot 4.1.x on Java 21, newest stable 4.1 patch when Phase 1 begins.** The rest of this document is now consistent with it; a yearly minor bump (4.1 → 4.2 → …) is part of the maintenance plan (R10).

---

## 3. Repository structure

```
sms-offline/
├── docs/                          PHASE0-ARCHITECTURE.md, later: ERD export, ADRs, test log
├── backend/                       Spring Boot 4.1.x (Maven, Java 21)
│   ├── .mvn/wrapper/ · mvnw · mvnw.cmd · pom.xml
│   └── src/
│       ├── main/java/kh/school/sms/
│       │   ├── SmsApplication.java
│       │   ├── config/            DataSource+SQLite pragmas, Security, CORS, Jackson, paths
│       │   ├── common/            ApiError, exceptions, converters (Decimal/Date), KhmerText
│       │   ├── security/          LaunchSecretFilter, SessionTokenFilter, SessionRegistry, AuthService
│       │   ├── bootstrap/         RestoreBootstrap, ParentWatchdog, ReadySignal, PreMigrationBackup
│       │   ├── settings/ · academic/ (years, grades, classes, subjects) · people/ (students, teachers, guardians)
│       │   ├── enrollment/ · attendance/ · exam/ (examinations, scores, grading) · homework/
│       │   ├── fees/ · reports/ (data + xlsx) · dashboard/ · backup/ · audit/ · files/
│       │   └── (each module: api (controller+DTO) / service / domain (entity) / repo)
│       ├── main/resources/{application.yml, db/migration/V*.sql, seed/}
│       └── test/                  unit + integration tests on a real temp SQLite file
├── frontend/                      Nuxt 4 SPA (ssr:false) → static `nuxt generate`
│   └── app/
│       ├── pages/ · layouts/ (default, auth, print) · components/ (ui/, forms/, domain/)
│       ├── composables/ · stores/ (Pinia) · services/ (API clients, one per module)
│       ├── schemas/ (zod 3) · i18n/km.json · utils/ (khmer.ts, date.ts, money.ts)
│       ├── assets/scss/ (Bootstrap theme via CSS variables) · assets/fonts (via @fontsource)
│       └── plugins/ (desktop bridge, bootstrap-vue-next, dayjs km)
├── desktop/                       Electron
│   ├── src/main/                  index.ts, backend-process.ts, protocol.ts, ipc/*.ts, windows.ts, security.ts
│   ├── src/preload/index.ts       exposes `window.desktop` (bundled to one CJS file)
│   ├── src/splash/ (static HTML)  src/error/ (static HTML, Khmer)
│   ├── build/                     icon.ico, installer assets; `jre/` generated by jlink (git-ignored)
│   └── electron-builder.yml
├── scripts/                       build-backend, build-jre (jdeps+jlink), build-all, dev, clean
├── package.json                   npm workspaces: frontend, desktop; root scripts
├── .gitignore · .editorconfig · README.md
```

Rules: no module reaches into another's `repo`; DTOs never expose entities; frontend components never call `fetch` directly (only `services/*`).

---

## 4. Electron + Nuxt + Spring Boot integration

### 4.1 Runtime picture

```
┌───────────────────────── Electron main process ──────────────────────────┐
│ single-instance lock · splash · spawn/monitor backend · IPC allow-list    │
│ app:// protocol serves the Nuxt build · injects launch-secret header      │
└──────┬────────────────────────────────────────────────┬───────────────────┘
       │ spawn (env: SMS_DATA_DIR, SMS_LAUNCH_SECRET)   │ BrowserWindow
       ▼                                                ▼ (sandbox, contextIsolation, no node)
┌──────────────────────────────┐  HTTP 127.0.0.1:<port>  ┌────────────────────────────┐
│ Spring Boot on bundled JRE   │◀────────────────────────│ Nuxt SPA (Pinia, Bootstrap)│
│ /api/v1 · Flyway · JPA       │  Bearer token + secret  │ talks only to services/*   │
└──────────────┬───────────────┘                         └────────────────────────────┘
               ▼
   %LOCALAPPDATA%\RuralSchoolManagement\  (school.db in WAL mode, uploads, backups, logs)
```

### 4.2 Startup sequence
1. `requestSingleInstanceLock()`; a second launch just focuses the first window.
2. Resolve data dir, create subfolders, redirect Electron `userData` to `<data>/config/electron`.
3. Show **splash window** (static, offline).
4. Kill a stale backend if `config/backend.pid` points at a live `java` from our install dir.
5. Generate a 32-byte random **launch secret**. Spawn `resources/jre/bin/java.exe` with `windowsHide`, JVM options from `config/app.json` (RAM-tiered defaults, §4C.3) followed by `-jar resources/backend/sms-backend.jar`, with `server.address=127.0.0.1`, `server.port=0`. Secret and data dir go in **environment variables, not argv** (argv is visible in the process list). Stdin is a pipe.
6. Backend boots: `RestoreBootstrap` (apply pending restore) → pre-migration auto-backup if migrations pending → Flyway → JPA → Tomcat → on `ApplicationReadyEvent` prints `SMS_READY {"port":N}` to stdout.
7. Electron parses the port, confirms with `GET /internal/health`, then opens the main window at `app://school/` (dev: Nuxt dev server). Timeout 60 s or early exit → **error window** (Khmer): reason, "retry", "open logs folder", "restore a backup".
8. Renderer asks preload for `{backendBaseUrl}` → `GET /api/v1/auth/status` → setup wizard (first run) or login.

### 4.3 Shutdown & process hygiene (Windows has no SIGTERM)
- Normal exit: Electron calls `POST /internal/shutdown` (secret-protected) → Spring closes Hikari (WAL checkpoint) → process exits; Electron waits ≤ 10 s, then `taskkill /PID <pid> /T /F`.
- **Electron crash/kill**: backend reads **stdin**; EOF ⇒ backend shuts itself down. No orphan JVM, no polling.
- Backend crash while running: Electron shows the error window with retry (restart backend without restarting UI).
- Dev override: `SMS_EXTERNAL_BACKEND=http://127.0.0.1:8089` skips spawning so the backend can run from IntelliJ.

### 4.4 Backend protection (defence in depth)
1. Bound to `127.0.0.1` only (`server.address`); verified with `netstat` in tests.
2. **Launch secret** header `X-SMS-Launch-Secret` required on *every* request (constant-time compare). Electron adds it in `session.webRequest.onBeforeSendHeaders`, filtered to `http://127.0.0.1:<port>/*` on the app's session. The renderer's JS never sees it; a browser tab or other local program cannot call the API.
3. CORS allows only origin `app://school`.
4. **App login** (BCrypt cost 12; details in §4A). On success the backend issues an **opaque random session token** held in server memory (not JWT): revocable, idle timeout (default 30 min, configurable), explicit logout, "lock" requires password re-entry. Token lives in Pinia memory only — never `localStorage`.
5. Login and recovery **throttling persisted in the DB** (survives app restarts): 5 consecutive failures → 1 min, 10 → 5 min, 15+ → 15 min cap. Never a permanent lockout.
6. Bean Validation on all request DTOs; no entity exposure; path-traversal-safe file service (UUID filenames; DB stores filename only).
7. Images are fetched with the token and shown via blob URLs (an `<img src>` cannot carry the Bearer token).
8. **Limitation, stated honestly:** the login protects the *application*, not the files. `school.db` and backup ZIPs are plain SQLite/ZIP, readable by anyone with access to the Windows account or the disk/USB stick. Mitigation: a Windows account password and BitLocker on her PC; encrypted backups are an optional Phase 5 decision (R22). The UI never claims more than this.

### 4.5 Electron hardening
`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, no `remote`, DevTools disabled in production, `setWindowOpenHandler → deny`, block `will-navigate` away from `app://school`, deny all permission requests, CSP (`default-src 'self'; connect-src 'self' http://127.0.0.1:*; img-src 'self' data: blob:; font-src 'self'`).

### 4.6 Preload API — the *entire* privileged surface (`window.desktop`)
Every handler checks `event.senderFrame.url` starts with `app://school` and validates arguments with zod. There is **no** generic `invoke(channel, …)`.

| Method | Purpose |
|---|---|
| `getInfo()` | `{ version, backendBaseUrl }` (never the secret) |
| `onBackendStatus(cb)` / `restartBackend()` | health / retry |
| `printCurrentPage(opts)` | `webContents.print()` for the *calling* window (system dialog → Windows printers) |
| `savePdfOfCurrentPage({ defaultName })` | `printToPDF({pageSize:'A4', printBackground:true})` → save dialog |
| `saveFile({ defaultName, bytes })` | save dialog + write; extension whitelist `.xlsx .pdf .zip` (used for Excel) |
| `backup.copyToFolder({ backupId })` | folder dialog → copy managed backup zip to USB/folder |
| `backup.pickForRestore()` | open dialog → copy chosen zip to `backups/incoming/`, return its name |
| `openLogsFolder()` / `openBackupsFolder()` | fixed targets only |
| `quit()` / `relaunch()` | used after restore |
| `printers.list()` | printer names + default flag via `getPrintersAsync()` (health page, print hint) |
| `metrics.get()` | Electron process memory totals via `app.getAppMetrics()` (health page) |
| `config.get()` / `config.update(partial)` | **whitelisted** keys of `config/app.json` only (JVM preset, GPU flag, idle-lock minutes); zod-validated; restart required |
| `health.exportDiagnostics(report)` | save dialog → writes the scrubbed diagnostics file |

### 4.7 Backup & restore (design)
- **Create**: `VACUUM INTO '<data>/backups/tmp.db'` (consistent snapshot, safe under WAL; no raw file copy) → zip `{school.db, uploads/, manifest.json}` as `SchoolBackup_YYYY-MM-DD_HH-mm-ss.zip` → manifest holds app version, Flyway schema version, SHA-256 per entry → **validate** (re-open zip, verify hashes, run `PRAGMA integrity_check` on the extracted DB) → record in `backup-history.json`. Success/failure surfaced in Khmer.
- **Copy to USB**: renderer → preload → main copies the zip, then re-verifies the copy's SHA-256.
- **Restore**: user picks a zip → `incoming/` → Spring *validates and stages* it into `restore-pending/` (rejects if schema newer than this app) → UI asks confirmation → Electron restarts the backend → `RestoreBootstrap` runs *before the DB opens*: takes a **pre-restore safety backup** of the current DB, swaps files, deletes WAL/SHM, then Flyway migrates forward if the backup is older.
- **Credentials travel with the backup**: `app_users` (password hash, recovery-key hash, recovery state) lives in the DB, so every backup contains it — as required. **Consequence:** restoring a backup also restores *that backup's* password and recovery key. The restore confirmation says so in Khmer; the pre-restore safety backup keeps the credentials you had before. A restore is also possible from the setup wizard's first screen (new PC / reinstall) — see §4A.3.
- **Auto safety nets**: pre-migration backup on every upgrade; rotating auto-backup in `backups/auto/` (keep last N). *Note: same-disk backups don't protect against disk loss* — dashboard shows a reminder when the last **external** backup is older than 7 days, and the app can prompt on exit.

### 4.8 Reports, printing, Excel
- **PDF/print**: Vue pages under layout `print` (`/print/report-card`, `/print/attendance-sheet`, …) using `@page { size: A4 }`, bundled Khmer fonts, `page-break-inside: avoid`. Preview in-app → "Print" or "Save PDF". Batch report cards for a class = one document, one card per page.
- **Excel**: Spring (Apache POI/SXSSF) returns bytes → renderer → `saveFile`. Cells use a Khmer-capable font. Khmer content checked in S1.

### 4.9 Dev workflow
`npm run dev` = Nuxt dev server (HMR) + Electron (spawns backend from `backend/target` using the Corretto JDK, data in `.dev-data/`). Backend can instead run from the IDE with `SMS_EXTERNAL_BACKEND`.

---

## 4A. Authentication, first-launch wizard & recovery key

### 4A.1 Account model
- **No default credentials anywhere.** Until the wizard creates the admin, the database has no user row.
- One account to start (`app_users.role = 'ADMIN'`); the schema already allows more users later without a migration.
- **Username**: chosen by the user, 3–32 chars, Unicode letters/digits and `. _ -`; stored normalised (NFC, lowercase) with a unique index.
- **Password**: ≥ 8 characters and ≤ 72 UTF-8 bytes (BCrypt's limit; D19) with a clear Khmer message. No composition rules; instead a small bundled weak-password list, "not equal to the username", and a strength hint. **BCrypt cost 12** (≈ 0.25–0.4 s on an i3 — to be measured; the cost is embedded in the hash, so it can be raised and rehashed at next login).
- **Throttling** (`failed_attempts`, `locked_until` in the DB, so restarting the app does not reset it): 5 failures → 1 min, 10 → 5 min, 15+ → 15 min cap. Recovery attempts have their own counters. A failed attempt never reveals whether the username exists.
- **Sessions**: opaque 256-bit token in server memory. The UI **locks** itself after an idle period (default 10 min; the screen keeps unsaved form state and needs the password to unlock); the server **expires** the token after 30 min idle / 12 h absolute (both configurable) — after that a full login is needed. Logout and password change revoke tokens.
- Every security event (setup, login failure burst, password change, recovery used, key regenerated) goes to `audit_logs` — **never** containing passwords or keys.

### 4A.2 Recovery key
| Aspect | Design |
|---|---|
| Generation | 25 characters from Crockford Base32 (no `I L O U`), 125 bits from `SecureRandom`, shown as `XXXXX-XXXXX-XXXXX-XXXXX-XXXXX`. Unique per installation; nothing is hardcoded or shared. |
| Storage | **Only `BCrypt(normalised key)`** in `app_users.recovery_key_hash` (+ `recovery_key_created_at`, `recovery_key_confirmed_at`). Input is normalised (case-insensitive; dashes/spaces ignored; `0/O`, `1/I/L` mapped). |
| Display | Exactly once, after creation (wizard), after a recovery, or after "regenerate". The plaintext exists only in that one HTTP response (`Cache-Control: no-store`) and in renderer memory while the screen is open. A logging test asserts it never reaches `backend.log`, `desktop.log` or `audit_logs`. |
| Saving it | **Print / Save as A4 PDF** through the normal print pipeline: a clean Khmer page (key in a large monospaced block, date, "keep it somewhere safe, away from this computer"). No "copy to clipboard" button (clipboard history). The user must tick *"I have saved it"* **and** retype the first group before continuing. |
| Unconfirmed key | If the app closes before confirmation, the next login is forced through "create a new recovery key" (the unconfirmed one is replaced), so a never-seen key can't silently become the only way back in. |
| **Reset flow** | `POST /auth/recover { recoveryKey, newPassword }` — works fully offline. With a single admin the key alone identifies the account (a user who forgot the password may also have forgotten the username); on success the screen tells them their username. In **one transaction**: verify key (throttled) → set new password hash → **replace recovery-key hash with a freshly generated key** (`confirmed_at = NULL`) → clear throttling → revoke all sessions → audit entry. The **old key is invalid the moment the transaction commits**; the new key is displayed once for printing. |
| Regenerate | Settings → Security: needs the current password; invalidates the old key immediately. |
| Change password | Needs the current password; revokes other sessions; recovery key unchanged. |
| Backups | The hashes live in `app_users`, so they are inside every backup. Restoring a backup restores that backup's credentials (§4.7, R21). |
| No backdoor | The shipped app has **no universal or master key and no reset-without-proof path**. If *both* password and key are lost, the app cannot help. As the developer you can still reset using a small offline CLI kept **in the repo, not in the installer** — it needs file access to the data folder, which already means full control of the data (§4.4 item 8). |

### 4A.3 First-launch setup wizard (`/setup`, layout `auth`, all text Khmer)
**Gate:** `GET /auth/status` → `{ setupRequired, authenticated, recoveryKeyPending, setupCompleted }`. `setupRequired` is true while no user exists; in that state the backend accepts only `/auth/status`, `/auth/setup`, `/internal/*`, quick health and the restore endpoints — everything else returns `401 SETUP_REQUIRED`. `POST /auth/setup` is atomic and returns `409` if a user already exists (no race, no second admin by replay).

| Step | Content | Backend |
|---|---|---|
| 1 Welcome & checks | Short Khmer intro; runs the quick health check (data folder writable, free disk, DB opened and migrated, Khmer font loaded). Link **"Restore from a backup"** for a new PC / reinstall. | `GET /system/health`; restore stage/apply |
| 2 Administrator | Display name, **username**, password + confirm, strength hint | `POST /auth/setup` → creates user, issues session, returns recovery key |
| 3 Recovery key | Show once → Print / Save PDF → confirm (§4A.2). *Cannot be skipped.* | `POST /auth/recovery-key/confirm` |
| 4 School profile | Khmer name, English name (optional), address, phone, director, logo (optional) | `PUT /settings/school` |
| 5 Academic year | Name + start/end dates; Grades 1–6 shown (pre-seeded); tick which default subjects to start with | `POST /academic-years`, `PUT /subjects/…` |
| 6 Backup & preferences | Choose USB/folder for backups (optional), reminder interval (default 7 days), idle-lock minutes | `PUT /settings/app` |
| 7 Finish | Summary + health result → *Start* | `POST /setup/complete` |

Steps 2–3 are mandatory. Steps 4–6 may be deferred: the dashboard shows a persistent "complete your school profile" task, because the school name is only strictly needed once report cards are printed. Progress (`setup.step`, `setup.completed_at`) is stored in `app_settings` — **in the DB, not browser storage** — so an interrupted wizard resumes after the next login, and a restored backup arrives with its own completed state.

---

## 4B. Application health check

Three layers, **all on demand — no heartbeat timers or background polling** (D20, §4C).

| Layer | Where | Auth | Purpose |
|---|---|---|---|
| 1 Liveness / readiness | `GET /internal/health` → `{ status, appVersion, schemaVersion, startedAt, startup: { jvmMs, restoreMs, flywayMs, jpaMs, tomcatMs } }` | launch secret only | Electron's startup gate; startup-phase timings feed the performance log (§4C). After startup Electron relies on the child-process `exit` event and a health call only when a request fails. |
| 2 Startup self-check | `StartupChecks` inside the backend, before `SMS_READY` | — | Fails fast with a **specific code** that the Electron error window turns into a Khmer message and the right recovery options. |
| 3 System Health page | `GET /system/health` (quick) · `POST /system/health/deep` · diagnostics export | session | Khmer status page for the user; same results shown in wizard steps 1 & 7 and as a small chip on the dashboard **only when something is WARN/FAIL** (no alert fatigue, R24). |

Result shape: `{ id, status: OK | WARN | FAIL | INFO, code, params, durationMs }`; the page shows `km.json` text for `code`. Overall status = the worst item.

| Check | Runs | Severity |
|---|---|---|
| `DATA_DIR_WRITABLE` (create + delete a temp file) | startup, quick | FAIL → blocks start |
| `DISK_SPACE` (< 1 GB WARN, < 200 MB FAIL) | startup, quick | WARN / FAIL |
| `DB_OPEN`, `FOREIGN_KEYS_ON`, `JOURNAL_WAL` | startup, quick | FAIL → blocks start |
| `SCHEMA_VERSION` (Flyway clean; DB not newer than the app) | startup, quick | FAIL → "install the newer version / restore" |
| `DIRTY_SHUTDOWN` (`config/running.lock` left behind) → runs `quick_check` + `foreign_key_check` | startup, only if lock found | WARN / FAIL → offers restore |
| `DB_INTEGRITY` (full `integrity_check` + `foreign_key_check`) | deep, on demand | FAIL |
| `UPLOADS_CONSISTENCY` (DB-referenced photos exist; orphan files counted) | deep | WARN |
| `LAST_BACKUP_AGE`, `LAST_EXTERNAL_BACKUP_AGE`, `BACKUP_FOLDER_REACHABLE` (USB inserted?) | quick | WARN beyond the reminder interval |
| `MEMORY` (JVM heap/non-heap; Electron total working set) | quick | WARN if heap > 85 % |
| `CLOCK_SANITY` (system date before the latest audit entry or before the build date) | quick | WARN — attendance and report dates depend on it |
| `ACADEMIC_YEAR_CURRENT` (exists and contains today) | quick | WARN |
| `FONTS` (renderer: bundled Khmer font actually loaded, not substituted) | quick | WARN |
| `PRINTERS` (at least one printer; default set) | quick, via preload | INFO / WARN |
| `LOG_SIZE`, `APP_VERSIONS` (app, backend, schema, Electron, Chromium, JRE) | quick | INFO / WARN |

**Diagnostics export** saves a text/JSON file with versions, check results, memory figures and the tail of the logs. **Logging rule enforced by tests:** logs and diagnostics contain IDs and codes, never student/teacher names, request bodies, passwords or keys. There is no automatic repair of data; a failed integrity check leads to a guided "restore latest valid backup".

---

## 4C. Target hardware, performance budgets & configuration

### 4C.1 Target profile
| Item | Target |
|---|---|
| OS | **Windows 11 64-bit — recommended production OS.** **Windows 10 22H2 64-bit — compatibility test target**, with the limitations in §4C.1a. x64 only. |
| CPU / RAM | Core i3-class, **8 GB recommended**; 4 GB is best-effort with a smaller heap |
| Storage | SSD; installed ≈ 0.5–0.7 GB; data usually < 500 MB with photos |
| Display | ≥ 1366×768. Verified at 1366×768 @100 %, 1536×864 (1080p @125 %), 1280×720 (1080p @150 %), 1920×1080 @100 %. **Minimum window 1200×650 CSS px**; collapsible sidebar; tables scroll inside their card, never the whole page. |
| Printing | Any Windows-installed **A4** printer through the standard print dialog; A4, ~15 mm margins; no vendor-specific code. If a driver mangles Khmer glyphs: *Save PDF → print from Edge/Adobe* (R20). |
| Sizing assumption | ≤ 1,000 students, ≤ 40 classes, ~10 years of history ≈ 0.5 M attendance rows — to be confirmed with your sister. |

### 4C.1a Operating-system support policy

| Level | Operating system | What it means |
|---|---|---|
| **Recommended (production)** | **Windows 11 64-bit**, a version still in Microsoft servicing | The primary platform: installer, upgrade, print, Khmer and performance tests run here first; performance budgets (§4C.2) are measured and promised here. |
| **Compatibility target** | **Windows 10 22H2 64-bit** | Full functional test pass in a VM during S4 and Phase 6. Defects are fixed when the fix is reasonable and does not harm Windows 11; **no performance guarantee and no Windows-10-only code paths**. |
| Not supported | Windows 7 / 8 / 8.1, any 32-bit Windows, Windows on ARM, Windows Server | Electron itself dropped 7/8/8.1 at v23 ([Electron releases doc](https://github.com/electron/electron/blob/main/docs/tutorial/electron-timelines.md)); the others are simply untested. |

**Windows 10 limitations, stated plainly**
1. **Microsoft ended mainstream support for Windows 10 on 2025-10-14.** Only the Extended Security Updates programme still delivers security fixes, and the sources I found disagree on the consumer ESU end date (2026-10-13 vs 2027-10-12; see this [Microsoft Q&A thread](https://learn.microsoft.com/en-ca/answers/questions/5805066/windows-esu-does-enrollment-end-on-13-oct-2026-or)) — **confirm on Microsoft's own Windows 10 ESU page** before advising your sister. A Windows 10 PC without ESU gets no OS security patches; this adds to the at-rest exposure in §4.4 item 8 / R22.
2. **Chromium (inside Electron) on Windows 10 is unconfirmed.** Google has published no consumer end date for Windows 10 support (a [Chrome Enterprise forum post](https://support.google.com/chrome/a/thread/332420301/support-for-chrome-and-windows-10-update) says ESU-enrolled devices stay supported to October 2028); I found nothing about Electron specifically. Precedent: Chrome kept Windows 7/8.1 until v109, years after Microsoft's end of support. Policy: pin one Electron major; because the app has no auto-update, a *future* Chromium that drops Windows 10 cannot break an installed copy; each Electron upgrade is re-tested on Windows 10 first.
3. **Hardware is the usual reason to stay on Windows 10**: Windows 11 needs TPM 2.0 and a supported CPU. If her PC cannot run Windows 11, Windows 10 22H2 is the fallback — but replacing or upgrading the PC is the recommended path.
4. Verified separately on both: Windows Khmer keyboard input, Khmer fonts, printing, the VC++ runtime needed by the bundled JRE (Corretto ships `vcruntime140.dll` / `msvcp140.dll` in its `bin` — to be confirmed in a clean VM in S4).

### 4C.2 Performance budgets (proposed — validated by measurement, then adjusted with evidence)
| Metric | Budget | How measured |
|---|---|---|
| Cold start: icon click → login screen | ≤ 15 s on i3/SSD (≤ 8 s on this dev PC) | `desktop.log` markers + Spring phase timings from `/internal/health` |
| Warm start (second launch) | ≤ 10 s | same |
| Idle memory, all processes together | ≤ 800 MB working set; JVM heap committed ≤ 200 MB | `Get-Process` after 60 s idle; JVM figures from `/system/health` |
| Peak during a 40-card report-card PDF | ≤ 1.2 GB total, no OOM | scripted run |
| Student list/search (1,000 rows) | < 200 ms API | integration test on seeded DB |
| Save attendance for 50 students | < 500 ms | integration test |
| Idle CPU | ≈ 0 % (no timers) | 5-minute sample |

**Measurement harness:** `scripts/measure.ps1` plus a dev-only `perf` seed profile (600 students, 24 classes, a year of attendance) write dated results — machine spec, Windows build, numbers — to `docs/PERF-LOG.md`. Order: (1) baseline on this PC in Phase 1; (2) a constrained VM (2 vCPU, 4–8 GB) as an i3/8 GB stand-in; (3) your sister's real PC once confirmed. I will report measured numbers, not estimates.

### 4C.3 JVM and app configuration (`config/app.json`, validated by Electron before spawn)
- **Defaults by installed RAM**, chosen at first launch: ≤ 4 GB → `-Xmx256m`; 6–8 GB → `-Xmx384m`; ≥ 12 GB → `-Xmx512m`. Always: `-Xms64m -XX:MaxMetaspaceSize=160m -XX:ReservedCodeCacheSize=64m -Xss512k -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -XX:+ExitOnOutOfMemoryError -Dfile.encoding=UTF-8 -Dstdout.encoding=UTF-8 -Dstderr.encoding=UTF-8`. **`TieredStopAtLevel=1` (C1 only) cut cold start by 52 % in measurement** (docs/PERF-LOG.md). On OOM the JVM exits cleanly and Electron offers a restart (no heap dumps — they would contain student data). The backend ships in the **extracted layout** (thin jar + `lib/`), which alone is 25 % faster than the fat jar. (The Phase 0 text about the console printing `?` is explained: the Windows console code page is not UTF-8; data is intact.)
- **Overrides**: `backend.jvm { maxHeapMb, initialHeapMb, extraArgs[] }`. Bounds: 192 MB ≤ max heap ≤ min(2 GB, 50 % of RAM); `extraArgs` accepts only `-XX:` and `-D` options from an allow-list (no `-javaagent`, `-cp`, `-jar`, `--add-*`). Restart required. Phase 1: file only; Phase 5: a Settings → *Performance* page with presets (Low memory / Standard / High).
- Other keys: `backend.port` (0 = automatic), `desktop.disableGpu` (off; for old integrated-graphics drivers), `session.idleLockMinutes`, `session.expireMinutes`, `logging.level`.
- **Spring trimmed for footprint**: no Actuator/DevTools, JMX off, banner off, `open-in-view=false`, `ddl-auto=none`, explicit Hibernate dialect + `hibernate.boot.allow_jdbc_metadata_access=false` (skips start-up metadata probing), Tomcat `threads.max=8`, Hikari `max≤4 / minIdle=1`, explicit component-scan packages. Lazy initialisation decided by measurement, not assumption.
- **No unnecessary background services (D21):** no Windows service, tray icon, auto-start with Windows, updater, telemetry or scheduled jobs. Session expiry is lazy, backup reminders are computed when the dashboard loads, health checks are on demand. Electron runs one window; spellcheck is off.
- **Startup optimisation — measured, not assumed** (docs/PERF-LOG.md): extracted layout −25 %, C1-only JIT a further −36 %. **AppCDS gave no gain** (and `AutoCreateSharedArchive` cost a 105 s first run) — my Phase 0 expectation that it would be the biggest win was wrong for this app, and it is dropped. Spring's start-up trace shows Hibernate's `EntityManagerFactory` (~3.4 s) is the dominant remaining cost. Further levers (Phase 6, only with measurement): overlap Electron window creation with the backend start, fewer entities at start, selective lazy beans.

---

## 5. SQLite database design

### 5.1 Conventions
- `INTEGER PRIMARY KEY` surrogate keys; human-facing codes (`student_code`, `teacher_code`, `receipt_no`) are separate `UNIQUE` columns generated from `id_sequences` **inside the creating transaction** (no gaps, no duplicates).
- Dates: `TEXT 'YYYY-MM-DD'`; timestamps: `TEXT` ISO-8601 UTC. Every table has `created_at`, `updated_at` (JPA auditing) and, where users edit rows, `version` (optimistic locking).
- Money: `*_minor INTEGER` + `currency TEXT CHECK IN ('KHR','USD')`. Scores: `*_x100 INTEGER` (7.25 → 725). No floating point stored.
- `CHECK` constraints for every enum-like column (`status IN (...)`).
- **Connection settings (verified by the probe, §2A.3):** application URL `jdbc:sqlite:<file>?foreign_keys=on&journal_mode=WAL&busy_timeout=5000&synchronous=NORMAL&transaction_mode=IMMEDIATE`. `foreign_keys=1`, WAL and the busy timeout were present on all four pooled connections. **`transaction_mode=IMMEDIATE` is required**: in default deferred mode 72–78 of 100 concurrent read-then-write transactions failed with `SQLITE_BUSY`; with IMMEDIATE, none. Open-in-view off; short transactions; pool ≤ 4. `synchronous=FULL` if S2 shows no cost.
- **Dates, timestamps and decimals use explicit `AttributeConverter`s — mandatory.** Without one, the driver stored a `LocalDate` as epoch milliseconds shifted by the machine's time zone (§2A.3 finding 1). With converters: `TEXT 'YYYY-MM-DD'`, `TEXT` ISO-8601 UTC, `INTEGER` ×100 for scores.
- FK policy: `ON DELETE RESTRICT` for all academic/financial history. `CASCADE` only for pure owned children (e.g. a student's guardians).
- **Deletion policy**: students/teachers/classes with history can only be *deactivated*. Hard delete is allowed only if no dependents exist, and the FKs enforce that even if the UI is bypassed. Payments are *voided*, never deleted.
- Khmer text: stored as UTF-8; names normalised on save (NFC, trim, collapse spaces, strip U+200B); free text kept as typed. Search queries normalised the same way.

### 5.2 ERD

```mermaid
erDiagram
  app_users {
    int id PK
    text username UK "normalized lowercase NFC"
    text display_name
    text role "ADMIN"
    text password_hash "BCrypt"
    text password_changed_at
    text recovery_key_hash "BCrypt of normalized key"
    text recovery_key_created_at
    text recovery_key_confirmed_at "null = not yet saved"
    int failed_attempts
    text locked_until
    int recovery_failed_attempts
    text recovery_locked_until
    int is_active
  }
  school_settings {
    int id PK "CHECK id=1"
    text name_km
    text name_en
    text address
    text phone
    text director_name
    text logo_file
  }
  app_settings {
    text key PK
    text value
  }
  id_sequences {
    text name PK
    int year PK
    int next_value
  }
  academic_years {
    int id PK
    text name_km UK
    text start_date
    text end_date
    int is_current "partial UK"
    text status
  }
  grades {
    int id PK
    int level UK "1-6"
    text name_km
    int grading_scale_id FK "nullable"
  }
  subjects {
    int id PK
    text code UK
    text name_km
    text name_en
    int sort_order
    int is_active
  }
  grade_subjects {
    int grade_id PK,FK
    int subject_id PK,FK
    int default_max_x100
    int weight_x100
  }
  teachers {
    int id PK
    text teacher_code UK
    text name_km
    text gender
    text phone
    text address
    text specialization
    text employment_date
    text status
  }
  classes {
    int id PK
    int academic_year_id FK
    int grade_id FK
    text name_km
    int capacity
    int homeroom_teacher_id FK "nullable"
    text shift
  }
  teacher_assignments {
    int id PK
    int class_id FK
    int subject_id FK
    int teacher_id FK
  }
  students {
    int id PK
    text student_code UK
    text name_km
    text name_en
    text gender
    text date_of_birth
    text place_of_birth
    text address
    text village
    text commune
    text district
    text province
    text enrollment_date
    text status
    text photo_file
    text notes
  }
  guardians {
    int id PK
    int student_id FK
    text name_km
    text relationship
    text phone
    int is_primary
  }
  enrollments {
    int id PK
    int student_id FK
    int academic_year_id FK
    int class_id FK
    text status
    text enrolled_on
    text left_on
    text end_reason
    int roll_no
  }
  attendance_sessions {
    int id PK
    int class_id FK
    text date
    text shift
    text note
  }
  attendance_records {
    int id PK
    int session_id FK
    int enrollment_id FK
    text status
    text remark
  }
  examinations {
    int id PK
    int academic_year_id FK
    text name_km
    text kind
    int term_no
    text start_date
    text end_date
  }
  examination_subjects {
    int id PK
    int examination_id FK
    int grade_id FK
    int subject_id FK
    int max_score_x100
    int weight_x100
  }
  student_scores {
    int id PK
    int examination_subject_id FK
    int enrollment_id FK
    int score_x100 "nullable"
    int is_absent
    text remark
  }
  grading_scales {
    int id PK
    text name_km
    int is_default
    int pass_percent_x100
  }
  grading_scale_bands {
    int id PK
    int scale_id FK
    int min_percent_x100
    text label_km
    text letter
    int is_pass
    int sort_order
  }
  homework {
    int id PK
    int class_id FK
    int subject_id FK
    text title
    text description
    text assigned_date
    text due_date
    text status
    text remark
  }
  school_fee_categories {
    int id PK
    text name_km
    int default_amount_minor
    text currency
    int is_active
  }
  student_fees {
    int id PK
    int enrollment_id FK
    int category_id FK
    int amount_due_minor
    text currency
    text due_date
    text note
  }
  fee_payments {
    int id PK
    int student_fee_id FK
    int amount_minor
    text paid_on
    text method
    text reference
    text receipt_no UK
    text voided_at
    text void_reason
  }
  audit_logs {
    int id PK
    text at
    text actor
    text action
    text entity_type
    int entity_id
    text summary
    text before_json
    text after_json
  }

  academic_years ||--o{ classes : has
  grades ||--o{ classes : has
  teachers |o--o{ classes : "homeroom"
  classes ||--o{ teacher_assignments : has
  teachers ||--o{ teacher_assignments : teaches
  subjects ||--o{ teacher_assignments : for
  grades ||--o{ grade_subjects : offers
  subjects ||--o{ grade_subjects : in
  students ||--o{ guardians : has
  students ||--o{ enrollments : has
  academic_years ||--o{ enrollments : in
  classes ||--o{ enrollments : in
  classes ||--o{ attendance_sessions : has
  attendance_sessions ||--o{ attendance_records : has
  enrollments ||--o{ attendance_records : "attendance of"
  academic_years ||--o{ examinations : has
  examinations ||--o{ examination_subjects : has
  grades ||--o{ examination_subjects : for
  subjects ||--o{ examination_subjects : of
  examination_subjects ||--o{ student_scores : has
  enrollments ||--o{ student_scores : "score of"
  grading_scales ||--o{ grading_scale_bands : has
  grading_scales |o--o{ grades : "override"
  classes ||--o{ homework : assigned
  subjects ||--o{ homework : about
  school_fee_categories ||--o{ student_fees : of
  enrollments ||--o{ student_fees : owes
  student_fees ||--o{ fee_payments : paid_by
```

### 5.3 Key constraints and indexes
| Rule | Mechanism |
|---|---|
| One current academic year | partial unique index on `academic_years(is_current) WHERE is_current=1` |
| A student has at most one **active** enrollment per year | partial unique `enrollments(student_id, academic_year_id) WHERE status='ACTIVE'` |
| Class name unique within year+grade | `UNIQUE(academic_year_id, grade_id, name_km)` |
| No duplicate attendance | `UNIQUE(class_id, date, shift)` on sessions; `UNIQUE(session_id, enrollment_id)` on records |
| One score per student per exam-subject | `UNIQUE(examination_subject_id, enrollment_id)` |
| One exam-subject per grade | `UNIQUE(examination_id, grade_id, subject_id)` |
| One teacher per class+subject | `UNIQUE(class_id, subject_id)` |
| Unique codes | `students.student_code`, `teachers.teacher_code`, `fee_payments.receipt_no`, `subjects.code` |
| Search/list speed | `students(name_km)`, `students(status)`, `enrollments(class_id)`, `attendance_records(enrollment_id)`, `student_scores(enrollment_id)`, `attendance_sessions(date)`, `audit_logs(at)`, `audit_logs(entity_type, entity_id)` |
| Cross-row rules (score ≤ max, enrollment grade = exam grade, capacity) | service layer + tests (SQLite CHECK can't see other rows) |

### 5.4 Notes
- **Promotion** (one transaction): close selected enrollments with outcome `PROMOTED | REPEATED | GRADUATED`, open new enrollments in next year's classes; idempotent via the partial unique index; capacity violations warn, not block.
- **Attendance corrections** update the record and write before/after to `audit_logs` — the original is never lost.
- **Outstanding balance** is *computed* (`due − Σ non-voided payments`), never stored, so it cannot drift.
- `audit_logs` has no FKs on purpose, so history survives any deletion.
- **Flyway** is forward-only. One migration per phase: V1 (users, settings, sequences, audit) → V2 (academic core, people, enrollments) → V3 (attendance, exams, grading, homework) → V4 (fees). SQLite `ALTER` is limited: column changes use the *create-new / copy / drop / rename* pattern. **Corrected after the probe:** `PRAGMA defer_foreign_keys=ON` does **not** work when the rebuilt table is referenced by another table — the commit failed with `FOREIGN KEY constraint failed` on both Boot lines. The pattern that passed: Flyway runs on **its own connection with `foreign_keys` off** (`spring.flyway.url` without the `foreign_keys` parameter), and every rebuild migration ends with a pure-SQL assertion — `CREATE TEMP TABLE _fk_assert(violations INTEGER NOT NULL CHECK (violations = 0)); INSERT INTO _fk_assert SELECT count(*) FROM pragma_foreign_key_check; DROP TABLE _fk_assert;` — which aborted and rolled back the migration on a deliberate orphan row. Every migration is tested against a seeded DB. Seeds (grades 1–6, subjects, default scale) are inserted by migration but fully editable.
- Settings: identity fields in the single-row `school_settings`; everything else (attendance shifts, report options, `fees_enabled`, `homework_enabled`, Khmer numerals on/off) in key/value `app_settings`. Setup progress (`setup.step`, `setup.completed_at`) lives here too — in the DB, never in browser storage — so it survives restarts and is carried inside backups.

---

## 6. API contracts

### 6.1 Conventions
- Base `/api/v1`, JSON UTF-8, `Authorization: Bearer <token>` (+ launch-secret header added by Electron).
- Request/response **DTOs only** (`XxxRequest`, `XxxResponse`, `XxxSummary`); entities never leave the service layer.
- IDs are numeric. Dates `yyyy-MM-dd`. Timestamps ISO-8601 UTC. Scores/money in the API are **decimal strings/numbers** (`"7.25"`); scaling is internal.
- **Errors** = RFC 9457 `ProblemDetail` + `code` + `fieldErrors[]`:
  ```json
  { "status": 422, "code": "VALIDATION_FAILED", "title": "…",
    "fieldErrors": [ { "field": "nameKm", "code": "REQUIRED" } ] }
  ```
  Codes (e.g. `STUDENT_HAS_HISTORY`, `ATTENDANCE_DUPLICATE`, `CLASS_FULL`, `BACKUP_SCHEMA_TOO_NEW`, `INVALID_CREDENTIALS`, `SESSION_EXPIRED`, `OPTIMISTIC_LOCK`) map to Khmer text in `km.json`. The backend never emits user-facing Khmer.
- **Constraint errors need our own translator.** Spring does *not* map SQLite codes to `DataIntegrityViolationException` (the probe saw `JpaSystemException` and `UncategorizedSQLException`). A small `SqliteConstraintTranslator` walks the cause chain for `SQLiteException` (error code 19) and maps UNIQUE, FOREIGNKEY, TRIGGER (RESTRICT), CHECK and NOTNULL to our codes (e.g. `STUDENT_CODE_DUPLICATE`, `STUDENT_HAS_HISTORY`), using the column name in the message when present. Hibernate also logs these expected violations at ERROR; that logger is set to a quieter level.
- Lists: filters via query params (`q`, `gradeId`, `classId`, `yearId`, `status`, `gender`). Small lists return full arrays; large ones (`audit`, histories) use `page`, `size`, `sort` → `{ items, total, page, size }`.
- Updates use `PUT` with `version` (optimistic locking); `409 OPTIMISTIC_LOCK` if stale.

### 6.2 Endpoints

| Module | Endpoints |
|---|---|
| Internal | `GET /internal/health` (liveness/readiness + startup timings) · `POST /internal/shutdown` (launch secret only, no session) |
| Auth | `GET /auth/status` → `{ setupRequired, authenticated, recoveryKeyPending, setupCompleted }` · `POST /auth/setup` (first run only; `409` if a user exists; returns session + recovery key once) · `POST /auth/login` · `POST /auth/logout` · `POST /auth/unlock` · `POST /auth/change-password` · `POST /auth/recover` (`recoveryKey`, `newPassword` → username + **new** recovery key once) · `POST /auth/recovery-key/confirm` · `POST /auth/recovery-key/regenerate` (needs current password) · `GET /auth/session` |
| Setup wizard | `GET /setup/progress` · `POST /setup/complete` |
| Settings | `GET/PUT /settings/school` · `POST/DELETE /settings/school/logo` · `GET/PUT /settings/app` (key/values) |
| Academic years | `GET/POST /academic-years` · `PUT /academic-years/{id}` · `POST /academic-years/{id}/set-current` · `POST /academic-years/{id}/close` |
| Grades & subjects | `GET /grades` · `PUT /grades/{id}` · `GET/PUT /grades/{id}/subjects` · `GET/POST /subjects` · `PUT /subjects/{id}` · `POST /subjects/{id}/activate\|deactivate` |
| Classes | `GET/POST /classes` · `GET/PUT /classes/{id}` · `GET /classes/{id}/students` · `PUT /classes/{id}/homeroom` |
| Teachers | `GET/POST /teachers` · `GET/PUT /teachers/{id}` · `POST /teachers/{id}/deactivate` · `GET/PUT /classes/{id}/teachers` (assignments) |
| Students | `GET/POST /students` · `GET/PUT /students/{id}` · `POST/DELETE /students/{id}/photo` · `POST /students/{id}/status` (inactive/graduated) · `DELETE /students/{id}` (only if no history) |
| Enrollment | `GET /students/{id}/enrollments` · `POST /enrollments` · `POST /enrollments/{id}/transfer` (class or out) · `POST /enrollments/promote` (bulk, preview via `?dryRun=true`) |
| Attendance | `GET /attendance/sheet?classId&date&shift` (creates nothing) · `PUT /attendance/sheet` (upsert session + records, one tx) · `POST /attendance/mark-all-present` · `GET /attendance/history?studentId\|classId&from&to` · `GET /attendance/summary` |
| Exams | `GET/POST /examinations` · `PUT /examinations/{id}` · `GET/PUT /examinations/{id}/subjects` · `GET /examinations/{id}/scores?classId&subjectId` · `PUT /examinations/{id}/scores` (bulk) · `GET /examinations/{id}/results?classId` (totals/avg/%/rank/pass) · `GET /students/{id}/results` |
| Grading | `GET/POST /grading-scales` · `PUT /grading-scales/{id}` · `PUT /grading-scales/{id}/bands` · `POST /grading-scales/{id}/set-default` |
| Report cards | `GET /report-cards/data?studentId\|classId&yearId&term` (JSON for the print page) |
| Homework | `GET/POST /homework` · `PUT /homework/{id}` · `POST /homework/{id}/status` |
| Fees (if enabled) | `GET/POST /fee-categories` · `PUT /fee-categories/{id}` · `GET/POST /student-fees` · `POST /student-fees/{id}/payments` · `POST /payments/{id}/void` · `GET /payments/{id}/receipt-data` |
| Reports | `GET /reports/{name}` (JSON for print pages) · `GET /reports/{name}/export.xlsx` |
| Dashboard | `GET /dashboard` (counts, today's attendance, recent exams, events, quick actions) |
| Backup | `GET /backups` (history, latest date) · `POST /backups` (create+validate) · `POST /backups/restore/stage` (`{ fileName }` from `incoming/`) · `POST /backups/restore/apply` (schedules restore; Electron then restarts backend) · `DELETE /backups/{id}` |
| Audit | `GET /audit-logs` (paged) |
| Health (§4B) | `GET /system/health` (quick checks) · `POST /system/health/deep` (full `integrity_check`, `foreign_key_check`, uploads consistency) · `GET /system/info` (versions, JVM memory) |
| Files | `GET /files/students/{name}` · `GET /files/school/{name}` |

**Setup mode:** while no admin exists, every endpoint except `/auth/status`, `/auth/setup`, `/internal/*`, `/system/health` (quick) and the backup restore endpoints answers `401 SETUP_REQUIRED` (§4A.3).

"Upcoming school events" on the dashboard needs a small `school_events` table (V2) — it is in the prompt but not in the suggested table list; I'll add it unless you object.

---

## 7. Local data directory

```
%LOCALAPPDATA%\RuralSchoolManagement\
├── database\   school.db  (+ school.db-wal / -shm while running)
├── backups\    SchoolBackup_*.zip · auto\ (rotating) · incoming\ · restore-pending\ · tmp\
├── uploads\    students\<uuid>.jpg · school\logo-<uuid>.png      (DB stores filename only)
├── logs\       backend.log (rolling) · desktop.log · diagnostics\ (exported reports, no personal data)
└── config\     app.json (JVM memory, port, GPU flag, idle-lock — §4C.3) · backup-history.json · backend.pid · running.lock (dirty-shutdown marker) · electron\ (Electron userData)
```
Never inside the install directory. The installer and uninstaller **never touch this folder**. Uploaded photos are resized/re-encoded to JPEG on upload (e.g. max 512 px) to bound size.

---

## 8. Windows packaging strategy

**Build pipeline**
1. `backend`: `mvnw package` → `sms-backend.jar` (Boot fat jar).
2. **Runtime**: `jdeps --print-module-deps` on the jar, then `jlink` from Corretto 21 → minimal JRE (expected modules: `java.base, java.sql, java.naming, java.management, java.logging, java.xml, java.desktop` (POI/ImageIO, headless), `jdk.unsupported, jdk.crypto.ec, java.instrument`…; final list from jdeps) with `--strip-debug --no-header-files --no-man-pages --compress=zip-6`.
3. `frontend`: `nuxt generate` → static `.output/public`.
4. `desktop`: esbuild bundles main + preload; electron-builder packs.

**electron-builder (NSIS, x64 only)**: `oneClick: true`, `perMachine: false` (installs to `%LOCALAPPDATA%\Programs\…`, **no admin prompt**), desktop + Start-menu shortcuts, `deleteAppDataOnUninstall: false`, app icon `.ico`. `extraResources`: `jre/`, `backend/sms-backend.jar`, `web/` (Nuxt build) — **outside asar** because `java.exe` must run from real files.

**Upgrades**: run the new installer over the old one; data dir untouched; Flyway migrates forward after an automatic pre-migration backup. Downgrade is unsupported; a backup from a *newer* schema is refused with a clear message.

**No updater, no telemetry, no network calls.** (Libraries are downloaded from Maven Central / npm only on the developer PC at build time; the installer bundles everything and the installed app makes no internet requests.) An automated test greps the built renderer for `http(s)://` hosts other than `127.0.0.1`.

**Measured size (S4, 2026-10-30):** installer **208 MB**, **476 MB** on disk after install (Electron 45 ≈ 280 MB, jlink JRE 49.6 MB / 21 modules, backend ≈ 66 MB, UI). My Phase 0 estimate of 150–200 MB was slightly low. Built per-user and one-click (no administrator prompt) into `%LOCALAPPDATA%\Programs\school-management`; shortcuts on the desktop and in the Start menu; uninstall removes the program but **never touches `%LOCALAPPDATA%\RuralSchoolManagement`** (tested: install → run → uninstall → reinstall, data intact). **Electron fuses** are flipped in the shipped exe (`runAsNode`, `NODE_OPTIONS`, `--inspect` off; asar integrity on), so the installed app ignores `ELECTRON_RUN_AS_NODE` — tested. The jlink JRE carries its own Visual C++ runtime DLLs; whether a clean PC needs anything else is still to be confirmed on a clean VM.

**Signing**: unsigned ⇒ Windows SmartScreen shows "unknown publisher" on first install. Acceptable for a one-PC install (click *More info → Run anyway*); a code-signing certificate is optional.

**Startup performance & memory**: see §4C — budgets, measurement harness, configurable JVM settings, AppCDS only if measurements justify it.

---

## 9. Khmer language strategy

- **Fonts** bundled via `@fontsource`: *Noto Sans Khmer* (UI/body), *Battambang* (alt. body, closest to the Khmer OS look schools are used to), *Moul* (formal titles on report cards). All SIL OFL; license files shipped. `font-display: block`, `lang="km"` on `<html>`, generous `line-height` (≈1.6–1.7; Khmer stacks are tall).
- **Word wrapping**: `lang="km"`, `word-break: normal`, `overflow-wrap: anywhere` only for narrow table cells; Chromium's ICU Khmer dictionary does the line breaking. Names/headers use `white-space: nowrap` + ellipsis only where full text is shown in a tooltip.
- **Input normalisation**: shared `KhmerText` util (frontend + backend) — NFC, trim, collapse spaces, strip U+200B in names; accept Khmer digits `០–៩` in phone/number/search fields and convert to ASCII for storage. Option to **display** numerals in Khmer on reports.
- **Dates**: Day.js with `km` locale; Khmer month names; `ថ្ងៃទី … ខែ … ឆ្នាំ …` for formal documents.
- **Sorting**: `Intl.Collator('km')` client-side (D13).
- **Translations**: single `app/i18n/km.json`, namespaced (`common`, `nav`, `student`, `attendance`, `exam`, `report`, `backup`, `error.*`, `validation.*`). I draft natural Khmer; **you or your sister review wording** before release — I won't claim machine-drafted Khmer is final.
- **Reports**: PDF via Chromium (D3), Excel via POI with a Khmer-capable cell font. Verified only after spike S1 on a machine *without* Khmer fonts installed.
- Optional on report cards: Kingdom of Cambodia national header and MoEYS-style layout — depends on your sister's template (§12).

---

## 10. Technical risks

| ID | Risk | Impact | Mitigation | Proven by |
|---|---|---|---|---|
| R1 | Khmer shaping/line-breaking wrong in PDF, print or Excel | High | Chromium print pipeline; bundled fonts; Excel font choice | S1 |
| R2 | Hibernate SQLite community dialect quirks (dates, decimals, identity) | Med | **Probe:** IDENTITY ✔, Khmer ✔, converters ✔; the default date mapping is time-zone-shifted epoch ms → converters mandatory. Integration tests on a **real SQLite file**, not H2 | S2 |
| R3 | `SQLITE_BUSY` / long transactions | Med | **Probe:** deferred mode failed 72–78 / 100 concurrent tx; `transaction_mode=IMMEDIATE` failed 0. WAL, `busy_timeout`, pool ≤ 4, open-in-view off, short tx | S2 |
| R4 | Flyway + SQLite `ALTER` limits; FK pragma cannot change inside a transaction | Med | **Probe:** `defer_foreign_keys` rebuild **fails** on referenced tables. Use Flyway-on-its-own-FK-off-connection + SQL assertion (§5.4); migration tests V1→latest on seeded data | S2 |
| R5 | Windows process lifecycle: no SIGTERM, orphan JVM, stale pid | High | Shutdown endpoint + stdin-EOF watchdog + `taskkill /T` + single-instance lock + stale cleanup | S3 |
| R6 | Backup/restore corruption (live WAL DB, swap under open pool) | High | `VACUUM INTO`, manifest + SHA-256, integrity check, restore-at-startup, pre-restore safety backup | Phase 5 tests |
| R7 | **Single-PC data loss** (disk failure, theft, reinstall) | High | External-backup reminders, exit prompt, auto pre-migration + rotating local backups; local backups alone are not safety | Phase 5 |
| R8 | JVM + Spring + Hibernate + Flyway cold start on an i3-class PC | Med | Budgets and measurement harness (§4C.2); splash; phase timings; AppCDS if needed; measure on a constrained VM, then on her PC | S3 / Phase 6 |
| R9 | Installer size, antivirus false positives (Java spawned from AppData), SmartScreen | Med | Per-user install, test with Defender; note work-network AV (Kaspersky) already blocks some dev tooling | S4/Phase 6 |
| R10 | Spring Boot 4.1 leaves free support on 2027-07-31; 4.1 is a young line | Low–Med | Plan the 4.1 → 4.2 minor bump after 4.2 GA (free support to 2027-12-31); keep Boot-specific code thin; loopback + launch secret limit exposure; re-run the compatibility probe on every bump | Phase 6 / yearly |
| R11 | Version incompatibilities (zod 4 vs vee-validate; TS 7 vs vue-tsc; ApexCharts 8) | Low–Med | Exact pins, lockfile, D2, resolve in Phase 1 scaffold | Phase 1 |
| R12 | Forgotten password → lockout | High | Recovery key (D8) | Phase 1 |
| R13 | Khmer search/sort inconsistencies (equivalent Unicode sequences, ZWSP) | Med | `KhmerText` normaliser, client collator | S1 |
| R14 | **Dev PC has Khmer fonts installed → font-bundling bugs are invisible** | Med | Test on clean Windows w/o Khmer fonts; assert via `document.fonts.check()` | S4/Phase 6 |
| R15 | Grading/report rules differ from my assumptions | Med | Configurable engine; confirm real rules with your sister before Phase 3 | §12 |
| R16 | Other local software calling the API | Low | Random port, launch secret, CORS | Phase 1 tests |
| R17 | Schema upgrade/downgrade mismatch | Med | Forward-only; schema version in backup manifest; refuse newer | Phase 5 |
| R18 | Memory on 8 GB (or 4 GB) machines — Electron + JVM together | Med | RAM-tiered heap defaults, configurable (§4C.3), no background services, measured figures replace my estimate | Phase 1 baseline, Phase 6 |
| R19 | Windows 10 22H2 is outside regular Microsoft support, and Chromium's Windows 10 stance is unconfirmed (§4C.1a) | Med | Windows 11 is the recommended production OS; Windows 10 is a tested-in-a-VM compatibility target with no performance guarantee; pin the Electron major and re-test Windows 10 first on every bump | S4 / Phase 6 |
| R20 | A printer driver mishandles Khmer glyphs (device-font substitution or driver rasterising) | Med | Test on the physical printers; fallback *Save PDF → print from Edge/Adobe*; raster-print option only if needed | S1 / Phase 6 |
| R21 | Restoring a backup reverts the password and recovery key to that backup's; user holds only a newer key | Med | Explicit Khmer warning in the restore dialog; pre-restore safety backup; key sheet carries its creation date; wizard-time restore documented | Phase 5 |
| R22 | DB and backup ZIPs are unencrypted (anyone with disk/USB access can read them) | Low–Med | Windows password + BitLocker advice, honest UI text; optional encrypted backups decided in Phase 5 | Phase 5 |
| R23 | BCrypt's 72-byte limit silently truncating long Khmer passwords | Low | Enforce ≤ 72 bytes with a clear message (D19); recovery key is ASCII | Phase 1 tests |
| R24 | Health-check noise (alert fatigue) or false alarms | Low | Only WARN/FAIL surfaced; thresholds in config; on-demand deep checks | Phase 1 / 5 |

---

## 11. Implementation checklist

### Phase 1 — Foundation *(starts with four time-boxed spikes)*
- [ ] `git init`, `.gitignore`, `.editorconfig`, root npm workspaces, `JAVA_HOME` helper
- [ ] **S1 Khmer**: bundled font renders in Electron; Khmer typed with the Windows Khmer keyboard; `printToPDF` + real print to a physical printer; Excel with Khmer cells; `Intl.Collator('km')` order; PDF fonts confirmed *embedded* (not substituted) and the PDF opens correctly in two viewers; all checked with Khmer system fonts hidden
- [ ] **S2 DB**: SQLite + Hibernate + Flyway + FK/WAL pragmas + converters; duplicate/FK tests; migration V1; concurrent read/write behaviour — **gate: must pass before any backend scaffolding.** Step 0: resolve the newest stable 4.1.x patch and re-run the Phase 0 compatibility probe against it (Java 21 × sqlite-jdbc × Hibernate × Flyway). Then repeat on the real V1 schema and add MVC, Security, validation and POI. *(The Phase 0 probe already passed 12/12 on 4.1.2.)*
- [ ] **S3 Lifecycle**: spawn/ready/health/shutdown; kill Electron → JVM exits; kill JVM → error window; second launch; startup-phase timing markers and the first `PERF-LOG.md` baseline
- [ ] **S4 Skeleton installer**: jlink JRE + NSIS installer that launches a hello-world stack; run in a clean env, network off, **on Windows 11 (primary) and Windows 10 22H2 (compatibility)**
- [ ] Backend (only after S2 passes): Spring Boot 4.1.x scaffold (newest stable patch), security filters (launch secret, session token), `V1` migration, logging (no personal data), error model
- [ ] **Auth & recovery**: setup (`409` replay-safe), login, logout, lock/unlock, change password, recover, regenerate/confirm recovery key, persisted throttling, session expiry; BCrypt with 72-byte rule
- [ ] **Setup wizard** (7 steps, resumable, restore-from-backup entry) + Khmer login / lock / recovery screens + recovery-key print page
- [ ] **Health**: `/internal/health` with phase timings, `StartupChecks`, `running.lock`, quick checks, System Health page, scrubbed diagnostics export
- [ ] **Config**: `config/app.json` loader with validation, RAM-tiered JVM defaults, allow-listed overrides
- [ ] **Performance**: `scripts/measure.ps1`, `perf` seed profile, baseline numbers in `docs/PERF-LOG.md`
- [ ] Frontend: Nuxt 4 SPA, Bootstrap theme + CSS variables, layout (sidebar/header) usable at 1366×768 and at 125 %/150 % scaling, i18n `km`, school settings page
- [ ] Desktop: `app://` protocol, CSP, preload, IPC allow-list, splash + error windows
- [ ] Tests: recovery key never stored/logged in plaintext; old key rejected after use; new key issued; sessions revoked on recovery; throttle survives restart; setup endpoint rejects a second admin; backup contains the hashes
- [ ] **Exit criteria**: installer builds; installs; first launch runs the wizard end to end; login, lock and recovery work offline; settings persist across restart; health page is green; backend dies with the app; baseline measurements recorded

### Phase 2 — Core school management
- [ ] V2 migration; academic years, grades, classes, subjects, teachers, students, guardians, enrollments, photos, student ID generation
- [ ] Search/filters, Excel student list, student profile/print, promotion & transfer, deactivation rules
- [ ] Tests: unique/FK/deletion rules, promotion idempotency, capacity

### Phase 3 — Academic operations
- [ ] V3 migration; attendance sheet + history + audit; examinations, score entry, calculations, ranking, pass/fail; grading scales; report cards (A4); homework
- [ ] Tests: calculation edge cases (absent vs zero, ties, rounding), duplicate attendance, report-card data

### Phase 4 — Reports & administration
- [ ] Dashboard; all listed reports as PDF + Excel; print layouts; optional fees (V4) with receipts

### Phase 5 — Reliability
- [ ] Backup/validate/restore/history; reminders; audit viewer; log rotation; deep health check; Performance presets page; restore dialog warns that credentials revert (R21); decision on optional encrypted backups (R22); restore tests (corrupt zip, newer schema, interrupted restore)

### Phase 6 — Production packaging
- [ ] Hardened electron-builder config; installer/uninstaller/upgrade/reinstall-with-data tests; Windows-restart test; network-disabled full pass; AV check; size/startup/memory measured against the §4C.2 budgets on Windows 11 — on a constrained i3/8 GB-like VM and on her real PC; full functional pass on Windows 10 22H2; 1366×768 layout pass at 100/125/150 % scaling; final Khmer print test on her printer

Each phase ends with: tests green, built app run, results written to `docs/TEST-LOG.md` — a feature is only called "working" once it appears there.

---

## 12. Decisions recorded, defaults you can veto, and what is still open

### Resolved (your decisions, 2026-10-30)
1. **Spring Boot 4.1.x on Java 21 (option B)** — approved 2026-10-30; newest stable 4.1 patch when Phase 1 begins (4.1.2 today). Also confirmed: keep the Electron + Nuxt + Spring Boot architecture; no cloud services or internet dependencies.
2. **Recovery key** — implemented as specified in §4A.2 (no default credentials, user-created admin, secure random key shown once, hash only, offline reset, old key invalid immediately, new key issued, included in backups, no hardcoded universal key).
3. **Hardware profile** — **Windows 11 64-bit recommended; Windows 10 22H2 as a compatibility target** (§4C.1a), i3-class, 8 GB recommended, SSD, ≥ 1366×768, A4 printing (§4C). Exact PC and printer models still unconfirmed → everything is measured, JVM memory is configurable, printing uses the standard Windows dialog.
4. **Extra requirements** — first-launch wizard (§4A.3), secure local admin auth (§4A.1), password recovery (§4A.2), application health check (§4B).

### The nine defaults — **approved by you on 2026-10-30**
| # | Proposed default | Reason |
|---|---|---|
| 1 | **One admin account; the recovery key alone resets the password**, then the screen shows the username (§4A.2) | One user; a person who forgot the password may also have forgotten the username; fewer fields to get wrong. More users can be added later without a schema change. |
| 2 | **Password: 8 characters minimum, 72 UTF-8 bytes maximum; no composition rules** — only a weak-password list and "not equal to the username" (§4A.1) | 8 blocks trivial passwords; composition rules push people toward predictable patterns. 72 bytes is BCrypt's limit (≈ 24 Khmer characters), so we reject clearly instead of silently truncating. |
| 3 | **No backdoor in the installed app.** A developer-only offline reset tool stays in the repo, outside the installer (§4A.2) | Honours "no universal recovery key". Anyone with file access already controls the data, so the tool adds no new exposure — and it lets *you* rescue her if both password and key are lost. |
| 4 | **UI locks after 10 min idle; server session expires after 30 min idle / 12 h absolute**; all configurable (§4A.1) | A school office PC is often left unattended with student data on screen. The lock keeps half-typed forms; the longer server limit avoids constant re-logins. |
| 5 | **Performance budgets**: cold start ≤ 15 s on i3/SSD (≤ 8 s on this dev PC), idle ≤ 800 MB for all processes, list/search < 200 ms at 1,000 students (§4C.2) | Her exact PC is unknown, so I need concrete numbers to measure against; they are *proposals* and will be changed by measured evidence, not defended. |
| 6 | **Minimum window 1200×650 CSS px; collapsible sidebar** (§4C.1) | A 1366×768 screen leaves ≈ 1366×728 after the taskbar, and 1080p at 125 %/150 % scaling gives 1536×864 / 1280×720 CSS px — the UI must fit all of them. |
| 7 | **8 GB RAM is the design point; 4 GB is best-effort with a smaller heap** (§4C.3) | 8 GB is your stated target. Electron plus the JVM may swap on 4 GB, so I will only promise what I have measured. |
| 8 | **Add a small `school_events` table** for the dashboard's "upcoming school events" (§6.2) | The dashboard requirement needs a data source, but the table was missing from your suggested list. It is tiny and purely additive. |
| 9 | **Setup wizard: steps 2–3 (admin + recovery key) are mandatory; steps 4–6 (school profile, academic year, backup folder) can be deferred** (§4A.3) | Skipping the account or the key risks an unprotected app or a later lock-out. The other steps may need information she doesn't have at hand during installation; a dashboard task keeps reminding her. |

### Still open — needed only by the phase that uses it
- *Phase 2*: morning/afternoon **shifts**? (a `shift` column exists; unused if not)
- *Phase 3*: the real **grading rules** — year layout (months/semesters), score scale per subject, how monthly/semester/annual averages combine, pass mark, grade bands, ranking and ties. A photo of a current report card settles most of this.
- *Phase 3/4*: Kingdom of Cambodia / MoEYS header on report cards? Khmer numerals or Arabic digits?
- *Phase 4*: fee currency (KHR, USD, both) if fees are used.
- *Phase 6*: accept the unsigned-installer SmartScreen warning?
- *When known*: your sister's actual PC and printer models → final measurements and print tests.

---

## 13. Approval status and next step

**Approved (2026-10-30)**
- Spring Boot **4.1.x** with **Java 21**, newest stable 4.1 patch when Phase 1 begins (4.1.2 today; 4.2 is only a release candidate).
- Keep the Electron + Nuxt + Spring Boot architecture; no cloud services or internet dependencies.

**Also approved (2026-10-30):** all nine defaults in §12, without changes.

**Order of work for Phase 1**
1. (done) You reviewed and approved the nine defaults.
2. Phase 1 opens by re-resolving the newest stable 4.1.x patch and re-running the compatibility check (Boot 4.1.x × Java 21 × SQLite JDBC × Hibernate × Flyway) before any backend code.
3. **S2** (SQLite persistence + migration spike) must pass before the backend scaffold is built; S1, S3 and S4 follow the order in §11.
