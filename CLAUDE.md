# CLAUDE.md — working agreement and context for this repo

Offline Khmer primary-school management system for ONE Windows PC (Cambodia). Electron + Nuxt 4 + Spring Boot 4.1.x (Java 21) + SQLite.
No cloud, no internet at run time. Read these first: `docs/PHASE0-ARCHITECTURE.md` (decisions, §12 approved defaults),
`docs/PHASE1-PROGRESS.md` (what is proven and what is not), `docs/PERF-LOG.md`, `README.md` (commands).

## How the owner wants to work (non-negotiable)
- **Approval gates.** Phases: 0 architecture → 1 foundation → 2 core school management → 3 academic ops → 4 reports/admin → 5 reliability/backup → 6 packaging.
  **Never start the next phase without an explicit "approved".** Phase 0 and 1 are done; **Phase 2 has NOT started.**
- **Decisions are shown as a complete numbered list with the proposed value AND the reason, in the reply itself** (not a pointer to a document), then wait for approval.
- **Do not claim a feature works until it has been tested.** PASS = a command was run and its output observed. Say plainly what was NOT verified.
- **Do not commit or push unless asked.** Do not print on physical printers unasked. Do not change the owner's machine/user settings — report them.
- No cloud services, no internet dependencies at run time. Keep the Electron + Nuxt + Spring Boot architecture.

## Already decided (do not re-open)
Spring Boot 4.1.x (4.1.2 pinned) with Java 21 · all nine §12 defaults (one admin; recovery key resets password; password ≥ 8 chars and ≤ 72 UTF-8 bytes;
no backdoor; UI idle lock 10 min, server session 30 min idle / 12 h absolute; performance budgets; min window 1200×650 + collapsible sidebar; 8 GB design point;
`school_events` table; wizard steps 2–3 mandatory, 4–6 deferrable) · Windows 11 64-bit recommended, Windows 10 22H2 compatibility target.

## Facts that are not obvious from the code
- SQLite: `transaction_mode=IMMEDIATE` (deferred failed under concurrent writers); explicit AttributeConverters for dates (the driver's default is wrong);
  ×100 integer scores; Flyway runs on its own FK-OFF connection and asserts `pragma_foreign_key_check` after table rebuilds (`defer_foreign_keys` does NOT work).
- Start-up: extracted jar layout + `-XX:TieredStopAtLevel=1` helped (−52 %); AppCDS gave no gain.
- Electron IPC cannot clone Vue reactive objects → `toPlainData()` in `frontend/app/services/desktop.ts`. Chromium paints the window colour in PDF margins → white base colour.
- After a backend restart the port is reused (the page's CSP is bound to it). Single-instance lock is requested only after `userData` is set.
- Khmer: `Intl.Collator` has no `km` data (root collation sorts Khmer correctly); PDF text layer shows doubled vowel marks (extraction quirk, visible output is right).
- The real-shell tests catch bugs the browser/mocked tests cannot: after UI changes run `npm run e2e:app`, not only `npm run test -w frontend`.

## Tool quirks (Windows)
- A VS Code terminal may set `ELECTRON_RUN_AS_NODE=1`: Electron then starts as plain Node with no window. Clear it before `electron .` (test scripts do).
- npm may block dependency install scripts: if `node_modules/electron/dist/electron.exe` is missing, run `node node_modules/electron/install.js`.
- The project path may contain spaces: `scripts/run-mvn.mjs` already quotes it. JDK 21 comes from `JAVA_HOME` or `%USERPROFILE%\.jdks\corretto-21.0.6`.
- In the Bash tool, `\\` is collapsed before Python/sed see it; use the Edit tool for regex-bearing edits and run `node --check` afterwards.
- A freshly built `.exe` is slow on its first run (antivirus scanning) — repeat timings before drawing conclusions.

## Still needed from the owner (ask when the phase that uses it comes up)
Phase 2: morning/afternoon shifts? · Phase 3: real grading rules + a sample report card · Phase 3/4: MoEYS header, Khmer numerals on reports ·
Phase 4: fee currency · Phase 6: the school PC and printer models · native-speaker review of `frontend/i18n/REVIEW.md` · a real app icon · signed installer or not.

## Open verification (needs other hardware)
Windows 10 22H2 · a clean PC (no Java / VC++ / Khmer fonts) · network disabled (only sampled) · i3 / 8 GB timings · physical printing · Khmer keyboard typing · SmartScreen on the unsigned installer.
