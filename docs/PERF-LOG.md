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

## Still to measure (TODO)
40-card PDF peak memory (Phase 3) · constrained VM (2 vCPU, 4–8 GB) · her real PC · Windows 10 22H2 VM.
