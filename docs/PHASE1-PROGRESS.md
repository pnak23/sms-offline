# Phase 1 progress log

Rule: **PASS** means a command was run and its output observed. Anything else is TODO / NOT TESTED.
Decisions: Spring Boot **4.1.2** + Java 21 · all nine §12 defaults approved (2026-10-30). Architecture: [PHASE0-ARCHITECTURE.md](PHASE0-ARCHITECTURE.md). Measurements: [PERF-LOG.md](PERF-LOG.md).

## Status — Phase 1 engineering is complete on this PC; acceptance testing on other PCs is open
| Step | Status | Evidence (command → result) |
|---|---|---|
| Repo, `.gitignore`, `.editorconfig`, README (git initialised, **nothing committed**) | DONE | 264 source files, no binaries |
| Newest stable Boot 4.1.x re-resolved | DONE | 4.1.2 |
| **S2** SQLite persistence + migrations (gate) | **PASS** | `spikes/s2-persistence/RESULT.md` — 19/19 |
| Backend (auth, recovery, wizard API, settings, academic basics, health, lifecycle) | **PASS** | `npm run backend:test` → **33/33** |
| Backend process lifecycle | **PASS** | `npm run smoke:backend` → 19/19 |
| Desktop shell unit tests (JVM config, allow-list, file-name sanitizer) | **PASS** | `npm run test:desktop` → 7/7 |
| Electron shell + fixture page (CSP, secret injection, preload surface, IPC, restart, single instance, orphan prevention, Khmer error window) | **PASS** | `npm run e2e:shell` → all checks (S1 + S3) |
| Nuxt UI unit tests / type-check / static build | **PASS** | `npm run test -w frontend` → **135/135** · `npm run typecheck -w frontend` clean · `npm run generate -w frontend` → 75 files, 1.3 MB |
| Nuxt UI walkthrough in Edge (dev + static builds) | **PASS** (by the UI agent; I re-ran unit tests/type-check/build myself) | `npm run e2e:ui` → 32/32 per mode — 32 steps incl. wizard, lock-out countdown, recovery, lock/unlock, settings, health |
| **Real UI inside the real Electron shell** (strict CSP, `app://`, real preload, real PDF) | **PASS** | `npm run e2e:app` → **24/24**; found and fixed 2 real bugs (below) |
| Packaged app (`win-unpacked`, bundled JRE + backend + UI) | **PASS** | `npm run e2e:packaged` → all |
| **S4** installer, Windows 11 (this PC): per-user, no admin, run, uninstall, reinstall, data survives | **PASS** | `powershell -File scripts/test-installer.ps1` → 16/16, PC left clean |
| Offline behaviour: no non-loopback TCP/UDP from the app's processes | **PASS (sampled)** | `scripts/check-no-network.ps1` |
| One-command release build | **PASS** | `npm run build:all` (≈ 3 min incl. backend tests) → `desktop/release/SchoolManagement-Setup-0.1.0.exe` (≈ 209 MB) |
| Windows 10 22H2 · clean PC (no Java/VC++/Khmer fonts) · network disabled · her real PC · physical printer · Khmer keyboard | **NOT DONE** | need a VM or her PC — see below |

## Bugs the real-shell tests found that mocks/browser tests could not
1. **Vue reactive objects cannot cross Electron IPC** ("An object could not be cloned"): "Export diagnostics" silently failed in the real app while passing in the browser walkthrough (which mocks the preload). Fixed in `frontend/app/services/desktop.ts` (`toPlainData`) + a regression test.
2. **Gray page margins in PDFs/printouts**: Chromium paints the window's base colour in the `@page` margins. Fixed (white base colour); verified on the PDF (corner pixel 255,255,255).
3. After `restartBackend` a new random port would break the page's CSP → the port is reused (tested).
4. `requestSingleInstanceLock()` was requested before `userData` was set (lock is keyed on it) → reordered.
5. `defer_foreign_keys` table rebuild pattern was wrong (Phase 0 text) → replaced and tested.
6. My own test harness had vacuous checks twice (a process detector that matched nothing; a `|| true`); both were caught by sanity checks and fixed. Tests that can pass vacuously are a risk — I added a sanity assertion for each.

## What each backend test proves (33)
`BackendFlowTest` (18 ordered steps, real HTTP + real SQLite file in a folder named with Khmer + a space): setup gate · setup validation codes · admin creation + one-time recovery key (`no-store`) ·
only BCrypt hashes stored · second setup → 409 · login throttle (5 → 429, persisted, no user enumeration) · unlock · change password (other windows signed out, Khmer password ok) ·
**recovery** (throttled; lower-case/no-dash key accepted; weak new password does not burn the key; old key dead immediately; new key issued unconfirmed; sessions revoked) · regenerate key ·
school profile (Khmer, optimistic locking) · logo (decoded, resized, UUID name, traversal rejected, replaced file deleted) · app-settings whitelist · academic year/subjects ·
wizard completion blocked until the key is confirmed · health quick/deep · launch secret + CORS · **no password, key or token in `backend.log` or `audit_logs`**.
Plus: recovery-key format/normalisation, password/username policy (72-byte Khmer limit), throttle tiers, session expiry, start-up failure codes.

## S1 — Khmer rendering: verified vs not
Verified (Electron 45/Chromium, this PC): a uniquely-named bundled font (cannot be satisfied by an installed system font) renders Khmer correctly (coeng subscripts, stacked vowels, Khmer numerals, wrapping);
PDF is **A4** with **embedded** Noto Sans Khmer subsets, borders/shading print, `@media print` hides the toolbar; the real recovery-key sheet is one A4 page, key on one line, white margins;
`Intl.Collator` sorts Khmer correctly (Chromium has no `km` locale data — root collation); Excel with Khmer cells round-trips (S2).
**Limits:** (a) the PDF **text layer has doubled vowel marks** (`ភូមិថ្មីី`) — copy/search inside a PDF is affected, the visible output is correct; (b) **no physical printer was used** (I will not print on your Epson/Canon unasked) —
please print the recovery-key sheet once and compare; (c) Khmer **keyboard input** (IME) cannot be automated — type with the Windows Khmer keyboard by hand; (d) Electron's printer list **omits network printers** (Windows' default here is `\\kdsb-svr-ps\…Canon`),
so the health page's printer list is a hint only.

## Known gaps and decisions for you
- **Khmer wording needs a native review**: `frontend/i18n/REVIEW.md` lists the least certain strings (e.g. recovery key = កូនសោស្តារ, password = ពាក្យសម្ងាត់, the 72-byte explanation, the printed key sheet). Numbers in UI text use Arabic digits (listed there for your decision).
- The wizard's "Restore from a backup" and "backup folder" are shown **disabled** (Phase 5).
- A freshly finished wizard without an academic year shows a "system has warnings" chip on the dashboard (accurate — no current year — but alarming for a new install). Easy to soften.
- Backend: Spring's own 404/405 bodies and filter-level 401/403 carry no `code` (the UI shows an "unknown error"); a tiny handler would give better messages.
- Server session idle limit (30 min) vs lock screen: after 30 min locked, Unlock leads to sign-in (matches approved default 4).
- Placeholder app icon (`desktop/build/icon.png/.ico`) — replace with real artwork.
- Installer is **unsigned** (SmartScreen will warn on first install); 209 MB installer / 477 MB installed.
- Start-up is ~7–9 s on this i7 (budget ≤ 8 s here; i3 budget ≤ 15 s **unverified**). Idle memory with the real UI at the wizard: **617 MB** (budget ≤ 800 MB).

## Not verified yet — needs a clean VM or her PC
Windows 10 22H2 · a PC without Java / Visual C++ runtime / Khmer fonts (the bundled JRE ships its own VC++ DLLs) · network disabled (only *sampled* here) · i3 / 8 GB timings · SmartScreen · physical printing · Khmer typing.

## Environment findings on this PC (not changed)
- `ELECTRON_RUN_AS_NODE=1` is set in this shell (VS Code host): Electron then runs as plain Node. Test scripts clear it; the packaged app ignores it (Electron fuse).
- **`NODE_TLS_REJECT_UNAUTHORIZED=0` is set permanently at the Windows *User* level** — disables certificate checking for every Node process you run (npm, Electron downloads…). Probably a proxy workaround; worth removing or scoping.
- `C:\Users\pnak\package.json` contains `"type": "module"`, making Node treat every plain `.js` under your profile as ES modules; it broke electron-builder's cached CommonJS icon tool (worked around by generating the `.ico` ourselves).
- Windows Defender **and** Kaspersky are active; a freshly built `.exe` is much slower on its first run (scanning).
