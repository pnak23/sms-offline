# Performance log

Only measured numbers. Budgets are in [PHASE0-ARCHITECTURE.md §4C.2](PHASE0-ARCHITECTURE.md). Harness: `scripts/measure-startup.mjs`.
"Cold" = a freshly spawned JVM with an existing empty-schema database, spawn → `SMS_READY` line.

## 2026-10-30 — dev PC baseline (backend only, Electron not yet involved)

**Machine:** Intel Core i7-1255U (10 cores / 12 threads), 31.7 GB RAM, Samsung NVMe SSD, Windows 11 Pro 10.0.26200,
Corretto 21.0.6. **Windows Defender and Kaspersky Endpoint Security are both active** and scan every jar and class file the JVM
opens, so absolute numbers on this PC are probably pessimistic. This PC is far faster than the i3 target; **nothing here
proves the i3 budget (≤ 15 s)** — that needs the constrained VM / her real PC (PHASE0 §4C.2 order of measurement).

| Variant | Launch | Wall-clock spawn → READY (ms, 3–4 runs) | Verdict |
|---|---|---|---|
| A | fat jar (`java -jar sms-backend.jar`) | 16 321 · 16 804 · 16 036 | baseline |
| B | **extracted layout** (`jarmode=tools extract`, thin jar + `lib/`) | 12 569 · 12 195 · 12 081 | −25 % vs A |
| C | B + `-XX:TieredStopAtLevel=1` (C1 JIT only) | 8 200 · 7 984 · 7 688 | **−52 % vs A — adopted** |
| D | C + AppCDS archive (manual, 7.9 MB) | 14 159 · 9 532 · 8 769 | **no gain** (first run includes archive validation) |
| E | C + AppCDS + `spring.main.lazy-initialization=true` | 8 206 · 8 258 · 8 235 | no gain |
| F | C + `-XX:+AutoCreateSharedArchive` | 104 802 (archive dump) · 8 537 · 8 913 · 9 218 | **no gain, and a 105 s first run** |
| G | C + Hibernate Bean Validation off (`jakarta.persistence.validation.mode=none`) | 10 173 · 9 340 · 7 708 · 8 630 | within noise — reverted |

Run-to-run noise on this PC is about ±1.5 s.

**Where the time goes (variant C, Spring `ApplicationStartup` trace, `-Dsms.startup-trace=true`):**
`spring.context.refresh` ≈ 7.4 s, of which the Hibernate `EntityManagerFactory` ≈ 3.4 s, Spring Data repository proxying
≈ 0.7 s for the first repository, config-class parsing ≈ 0.85 s, post-processing ≈ 1.2 s, Flyway ≈ 0.3–0.5 s,
Spring Security chain ≈ 0.3 s. JVM boot itself is ≈ 40 ms.

**Decisions from the data**
- Ship the **extracted layout**, not the fat jar. Run with `-XX:TieredStopAtLevel=1` (C1 only).
- **AppCDS is dropped** — the Phase 0 expectation that it would be "usually the largest Spring start-up win" was **wrong for this app**
  (measured: none).
- The remaining lever is Hibernate bootstrap (3.4 s). Candidates for Phase 6, to be tried only with measurement: fewer entities
  loaded at start, `hibernate.bytecode.provider=none` (not possible once lazy associations exist), or overlapping the Electron
  window creation with the backend start (the UI is static and does not need the backend until the first API call).

## 2026-10-30 — backend lifecycle (functional, from `scripts/smoke-backend.mjs`, 19/19 passed)
Graceful shutdown via `POST /internal/shutdown` → exit 0 and `running.lock` removed; closing stdin (parent died) → exit 0;
force-kill → `running.lock` left behind and the next start reports `PREVIOUS_SHUTDOWN_NOT_CLEAN`; data folder with a space and
Khmer characters works; listening on `127.0.0.1` only (netstat); missing data dir / missing secret → `SMS_STARTUP_FAILED` codes, exit 1.

## 2026-10-30 — packaged app, no debugger attached (`scripts/measure-app.mjs`, same dev PC)
Installed layout (`desktop/release/win-unpacked`): Electron 45.1.0 + bundled **jlink JRE 21.0.6 (49.6 MB, 21 modules)** + extracted backend + a
tiny fixture page as the UI (the real Nuxt UI is not measured yet). Window closed like a user would (no `/F`).

| Run | Process start → window shown | Backend ready (inside the app) | Closed cleanly? |
|---|---|---|---|
| 1 — first launch, empty DB (migrations run) | 8 809 ms | 8 305 ms | yes |
| 2 — warm | 8 069 ms | 7 570 ms | yes |
| 3 — warm | 8 211 ms | 7 786 ms | yes |

**Idle memory after 45 s (run 3): 579 MB working set in 5 processes** — `java` 231 MB + Electron (`SchoolManagement`) 347 MB. Budget ≤ 800 MB: met *with the fixture
page*; **must be re-measured with the real UI loaded**. The Electron-only dev-mode figure was 390–400 MB with the test harness attached; attaching a debugger
(CDP) inflated it to ~795 MB, so debugger-attached numbers are not used.

Verdict vs budgets (this PC only): cold start **8.1–8.8 s vs ≤ 8 s target** — borderline, essentially the backend's 7.6–8.3 s. i3 target (≤ 15 s) still unverified.
The first run after building a new `.exe` is much slower (28 s seen once) because Defender/Kaspersky scan new binaries; ordinary launches are not affected.

## 2026-10-30 — packaged app with the REAL Nuxt UI (`scripts/measure-app.mjs`, same dev PC, no debugger)
| Run | Process start → window shown | Backend ready | Closed cleanly? |
|---|---|---|---|
| 1 — first launch, empty DB | 7 120 ms | 6 669 ms | yes |
| 2 — warm | 8 925 ms | 8 344 ms | yes |
| 3 — warm | 8 618 ms | 8 063 ms | yes |

**Idle memory (45 s at the setup wizard): 617 MB** in 5 processes — `java` 232 MB + Electron 385 MB (budget ≤ 800 MB: **met**). While using the System Health page the app itself reported
728 MB; a Playwright/CDP-attached run reads ~1 GB (debugger overhead — not used). Installer **208.8 MB**, **477 MB** installed. Run-to-run noise ≈ ±1.5 s.
Verdict (this i7 PC only): cold start 7.1–8.9 s vs ≤ 8 s target — borderline; i3 (≤ 15 s) unverified.

## 2026-10-31 — Phase 4: a school-sized data set (`scripts/measure-reports.mjs`, same dev PC)
Machine: Intel Core i5-10400F, 12 threads, **16 GB RAM**, Windows 11 (10.0.22631) — **not** the i3 / 8 GB design point. Data: 1,000 students in 25 classes, one class of 40 with a
scored examination (7 subjects, a teacher's comment on every card), one class of 50 for attendance. Backend started standalone with the app's JVM options (heap 512 MB, serial GC, C1 only).
API: median of 5 calls on a warm backend (the max is usually the first call).

| What (budget in §4C.2) | Median | Max | Budget | Verdict |
|---|---|---|---|---|
| `GET /students`, all 1,000 rows (358 KB) | 12 ms | 17 ms | < 200 ms | met |
| `GET /students?q=` (search) | 4 ms | 6 ms | < 200 ms | met |
| `PUT /attendance/sheet`, 50 students | 4 ms | 15 ms | < 500 ms | met |
| `GET /dashboard` | 2 ms | 8 ms | — | — |
| `GET` results of 40 students · the 40 report cards (79 KB) | 5 ms · 7 ms | 7 ms · 10 ms | — | — |
| `POST /reports/export`, 1,000 rows → .xlsx (39 KB) | 194 ms | 773 ms | — | — |
| `POST /students/export`, 1,000 rows → .xlsx (63 KB) | 342 ms | 489 ms | — | — |

**40-card report PDF** (the real print page in the real Electron shell, saved through the PDF path; nothing goes to a printer): 40 cards → **40 PDF pages** every time, 0.7–1.0 s.
Working set of all processes (Electron + the backend's `java`): **idle 671 MB, peak 867 MB** over three saves in a row, sampled every ~50 ms and for 3 s after each save — budget ≤ 1.2 GB: **met**.
Caveats, stated plainly: a debugger (Playwright) is attached to Electron for this run, which inflates its memory by a few hundred MB, so 867 MB is a pessimistic figure; the app was the
unpackaged Electron (same Electron and backend jar, the full JDK instead of the trimmed jlink JRE); the saved PDF was 290 KB the first time and 659 KB the next two with the same 40 pages
(not investigated). This PC has twice the RAM of the design point, so the JVM and Chromium had room they would not have on 8 GB.

## 2026-11-01 — Phase 5: what the memory presets cost and save (`scripts/measure-presets.mjs`, same dev PC, run twice)
Machine and data as above (i5-10400F, **16 GB**, 1,000 students). The backend was started standalone with the JVM options the desktop program really builds (`config.ts`, `jvmArgs()`), on the same data folder, under four settings.
Each setting ran: 10 measured calls after 3 warm-ups of each request in the table, then two bursts of the heavy requests (the 40 report cards, a 1,000-row Excel, the 1,000-row student list):
**3 clients × 10 rounds** (more than one school PC does) and **8 clients × 5 rounds** (an abuse test). Working set = the `java.exe` process alone.

| Setting (JVM heap, other flags) | Idle (4 s after start) | Peak during the work, run 1 / run 2 | Burst of 3 clients | Latency of single requests |
|---|---|---|---|---|
| **Standard on an 8 GB PC** (384 MB) | 264 / 263 MB | 386 / 434 MB | 3.2 / 3.1 s, 0 errors | list 14 ms, attendance 7 ms, 40 cards 8 ms |
| Standard on a 16 GB PC (512 MB; this PC) | 264 / 264 MB | 445 / 431 MB | 3.3 / 3.3 s, 0 errors | the same |
| **Low-memory** (192 MB, start at 32 MB, grow when 90 % full: `-XX:MinHeapFreeRatio=10 -XX:MaxHeapFreeRatio=30`) | **248 / 251 MB** | **358 / 357 MB** | **4.0 / 3.8 s**, 0 errors | the same |
| 192 MB heap and nothing else | 264 / 264 MB | 394 / 356 MB | 3.3 / 3.2 s, 0 errors | the same |

Whole app (unpackaged Electron, **no debugger**, 40 s idle on the login page; working set of every Electron process plus the backend's `java`):

| Preset | Graphics | Idle total | Electron | Java |
|---|---|---|---|---|
| Standard | on | **593 MB** | 343 MB | 250 MB |
| Low-memory | on | 595 MB | 346 MB | 249 MB |
| Standard | **off** | **565 MB** | 316 MB | 249 MB |
| Low-memory | off | 567 MB | 318 MB | 249 MB |

What this says, plainly:
- **The Low-memory preset is a small effect.** About 13 MB less just after start (gone after a minute: the whole-app idle figures are equal), a peak under heavy use roughly 20–70 MB lower (the run-to-run noise of the peak is itself about ±40 MB), no change in the speed of single requests, and the heaviest burst about 20 % slower because the collector runs more often. 192 MB is the smallest heap tried that finishes every request with 1,000 students (it is also the lowest the program allows).
- **Switching graphics off saves about 28 MB** of the roughly 590 MB the whole app uses at idle. The preset does not touch Electron's memory at all.
- The numbers that decide whether this PC copes are Chromium's (about 340 MB): neither setting changes that much. Not measured: a PC that really is short of memory (4–8 GB with other programs open), where a lower ceiling may matter more than here.
- **Found by the abuse test, not a memory effect:** with 8 clients at once, a few `GET /report-cards/data` requests answered **500** after waiting for the database (the run takes ~33 s instead of ~3 s). It happens at 512 MB just as at 192 MB, and one run of the same test had no errors, so it is timing: every transaction begins `IMMEDIATE` (SQLite's write lock), so parallel heavy requests queue behind each other and give up after the 5 s busy timeout. Three clients at once never produced an error. Nothing was changed for this (see `PHASE5-PROGRESS.md`, findings).

## Change round after Phase 5 (2026-11-01, development PC: i5-10400F, 16 GB)
Rerun of `scripts/measure-reports.mjs` after attendance sessions (V7) and the configurable report card, 1,000 students, heap 512 MB:
- Attendance for 50 students: median 4 ms (budget 500 ms). Student list 12 ms, search 3 ms. 40 report cards: 7 ms for the data.
- 40 cards saved as one PDF: 40 pages in about a second; whole app (Electron + backend, debugger attached) idle 680 MB, **peak 954 MB** over three saves (budget 1.2 GB).
- Each card now measures itself once (and again when the fonts arrive) to decide whether it needs the tighter type; with 40 cards that did not show in the peak above. Not measured: the cost on the school PC.

## Still to measure (TODO)
Constrained VM (2 vCPU, 4–8 GB) and her real PC for everything above · Windows 10 22H2 VM · the idle-CPU 5-minute sample · cold first launch of the real UI on a clean PC.
