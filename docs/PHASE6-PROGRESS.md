# Phase 6 — production packaging: progress log

**State on 2026-11-06 (read this first).** The weekly timetable (migration V10) is built and tested; the final verification run of its round passed (below). **No final installer has been built.** The only `KPSMS-Setup-1.0.0.exe` on this PC (237,432,560 bytes, written 2026-11-05 23:43, SHA-256 `6060961b6472b15226375083e8182e93873b41fd2e459efe95f0c2b480bc7a5b`) was made **before** the timetable (database schema 9): it is **stale, it is not the release candidate, and it has not been replaced or presented as final.** The next build of it waits for the owner's approval. **D22 (install, uninstall, reinstall) has not been run.** Nothing here claims the system is ready for the school: the real timetable, the native Khmer review (D19), physical printing, the Dell laptop and the installed-program tests are all still pending.

**The dashboard enlargement of the same day (owner-approved, 20 items):** a hero and six read-only charts are built and tested, with **no migration and no school data touched**; the final verification run of that round passed (the section "Checks run on the final sources (2026-11-06, the dashboard round)" below: backend 158, frontend 485, desktop 36, every real-shell suite including the new `e2e-dashboard` 39, the unpacked-build tests, the source fingerprint retaken, 707 files). **The installer on disk is therefore also stale with respect to the dashboard; still no installer was built.**

**The owner's decision of 2026-11-06:** the weekly-timetable implementation and its final verification are **accepted**; the **final installer build is ON HOLD** until the native Khmer review of `frontend/i18n/REVIEW.md` §19 is completed (and, because the dashboard wording was added the same day with the owner's agreement to postpone the review until it was complete, §20 with it), after which the owner wants to see the review outcome and every change made and will give a **separate approval for `node scripts/build-all.mjs`**. The existing installer stays untouched and stale; D22 stays blocked; the school's real timetable and all physical-hardware tests stay pending. **The application is not declared release-ready.** The steps from the review to the build are in `docs/RELEASE-BUILD-RUNBOOK.md`. **Later the same day the owner confirmed the Khmer wording of §19 and §20 acceptable with no correction** (`docs/KHMER-REVIEW-OUTCOME-19-20.md`); the build is still on hold until the owner's separate approval of `node scripts/build-all.mjs`, which has not been given.

**Started 2026-11-05**, on the owner's conditional approval of the Phase 6 plan (`docs/PHASE0-ARCHITECTURE.md` §15). This file is the log the owner asked for: every test, result, failure and piece of evidence goes here. A step is **PASS** only when a command was run and its output observed; a step that needs equipment this PC does not have stays **PENDING**, and nothing is marked passed without real evidence. The status of every step is at the top; the evidence follows.

## The owner's conditions

* Steps 10–17 are **never** marked passed without actual hardware evidence; every unavailable hardware check stays pending. **The actual school laptop, the printer, Khmer typing and a USB backup have not been tested** (owner, 2026-11-05: "Do not mark physical testing as passed").
* **D22 is conditional and still pending:** no installation, uninstall or reinstall test, and nothing installed or uninstalled on the owner's current Windows profile, until the owner explicitly approves it. *No installer has been run; none of those tests has been run.* (Running the unpacked `desktop/release/win-unpacked/KPSMS.exe` from the build folder with a temporary data folder, which is what the checks marked "from the build folder" below do, installs nothing and touches no real data.)
* No Windows features are changed without the owner's permission. No run-time internet dependency. No working around antivirus restrictions. No school rule or official information is invented.
* A build or test that fails stops the work and is reported here; no security restriction is bypassed silently.
* Homework stays separate from examination scores, totals, averages, rankings and report cards (built and proved on 2026-11-05, `docs/PHASE0-ARCHITECTURE.md` §18).

## The target hardware (owner, 2026-11-05)

| | |
|---|---|
| Laptop | **Dell Latitude** |
| CPU | Intel Core i5, 11th generation (the exact model was not given) |
| RAM | 8 GB |
| Storage | 512 GB SSD |
| Display | 14-inch Full HD, 1920×1080 |
| **Still unconfirmed** | the Windows version on it, its display scaling (100, 125 or 150 %), the printer |

The owner's requirements for it, and what each led to:

| Requirement | What was done |
|---|---|
| 1. Target the 14-inch FHD screen | The window follows the screen: never larger than the usable area, **maximised on a laptop-sized screen** (`desktop/src/main/windowSize.ts`); it used to start at 1366×768 whatever the screen, which is larger than the usable area of Full HD at 150 % (1280×672). |
| 2. Windows scaling at 100, 125 and 150 % | Full HD gives 1920×1001, 1536×785 and 1280×641 of window content at those scalings (the screen in logical pixels less a 48-pixel taskbar and a 31-pixel title bar). `e2e-layout.mjs` checks all 26 pages at each. |
| 3. Comfortable at 1366×768 and smaller logical workspaces | A 1366×768 laptop at 100, 125 and 150 % gives 1366×689, 1093×535 and 911×433; all 26 pages are checked at each, and at the smallest window, 880×440. **The window minimum was lowered from 1200×650 to 880×440, and the page minimum from 1200×650 to 860×420**, on the owner's requirement: that replaces the approved default of §12 (decision 6). A window narrower than 1100 px **collapses the side menu by itself** and opens it again when it widens (a person's own choice wins). |
| 4. No sideways scrolling on ordinary pages | Measured on every page at every size above: none scrolls sideways, nothing sticks out of the window outside a scrolling table, and no page needs a scroll bar on the page itself (the content area scrolls inside the shell). |
| 5. Memory suited to an 8 GB laptop | The program already sets the backend's heap by the installed RAM (6–8 GB: 384 MB; `desktop/src/main/config.ts`). The packaged program's idle memory on the development PC is in "Memory and start-up" below. **Not measured on the laptop.** |
| 6. Keep the Low-memory preset until it is measured | Unchanged. |

## The owner's answers to D9–D22 and what was done about each

| # | Decision | Answer | Done |
|---|---|---|---|
| D9 | Preferred fee currency | Approved: KHR, configurable to USD | **Built** (below) |
| D10 | No conversion, no combined totals | Approved | Nothing to build; already tested (`BackendFlowTest` order 58) |
| D11 | Unsigned installer, SmartScreen instructions | Approved | The installer is unsigned. The SmartScreen page is drafted: `docs/SMARTSCREEN-KM.html` (unreviewed; the SHA-256 is filled in at release) |
| D12 | Icon | The KPSMS logo if an asset exists, otherwise a simple monogram | No logo file existed at first, so a monogram was drawn; **then the owner supplied the logo (2026-11-05) and it is now the icon** (below). The old placeholder (the letters "aZ Ÿ") is gone |
| D13 | One-click installer, no wizard, no administrator prompt, shortcuts named KPSMS, Khmer from first launch | Approved | Configured that way in `desktop/scripts/package.mjs`; **only configuration was checked, the installer has not been run** (D22) |
| D14 | Windows 10 and clean-PC tests | Pending until equipment exists; no Windows feature changes | **Pending** |
| D15 | School PC, printer, USB, physical printing | Pending until the equipment exists | The laptop's specification is now known (above); the printer, the Windows version and the scaling are not. **Everything physical is pending** |
| D16 | Keep the Low-memory preset until measured on the school PC | Approved (again on 2026-11-05) | Nothing changed |
| D17 | Keep the documented concurrency setting | Approved | Nothing changed |
| D18 | No Spring Boot 4.2 during Phase 6 | Approved | Nothing changed |
| D19 | Khmer native-speaker review | Pending: the owner will confirm the reviewer and the deadline | **Pending** |
| D20 | One-page Khmer hand-over guide | Approved | **Drafted** (`docs/HANDOVER-KM.html`); needs D19's review before it goes to the school |
| D21 | One-time download of the NSIS build tools | Approved | **Done once** (see step 1) |
| D22 | Install, uninstall, reinstall tests | **Conditional: waits for the owner's explicit approval** | **Not run** |

## Status of the 19 steps

| # | Step | Status | Where the evidence is |
|---|---|---|---|
| 1 | Installer tooling: build the installer | **PASS** | Step 1 below |
| 2 | Icon and file properties | **PASS** | Step 2 below |
| 3 | Hardening review | **PASS** for what can be checked without installing (the installed behaviour is not yet tested) | Step 3 below |
| 4 | Install, run, uninstall, reinstall | **BLOCKED: D22 awaits the owner's approval.** The packaged program was run from the build folder: it starts, serves its UI, stops cleanly (that is not an install test) | "Memory and start-up" below |
| 5 | Upgrade over an existing install | **BLOCKED** (needs step 4) | — |
| 6 | Upgrade with a migration | **BLOCKED** (needs step 4) | — |
| 7 | Antivirus | **PENDING** (Windows Defender is switched off on this PC; see step 7) | Step 7 below |
| 8 | Windows restart and power loss | **PARTIAL**: a hard kill of the packaged program, recovery on the next start and no data lost are checked from the build folder (below; run again on the unpacked build of 2026-11-06: 11 / 11). **The installed program, a Windows restart and a real power cut are BLOCKED / PENDING** (D22) | "Step 8" below |
| 9 | Layout at 100 %, 125 % and 150 % | **PASS** at the logical workspaces of the target laptop and of a 1366×768 laptop (a window of the same size, not the real display scaling). **The real laptop is PENDING** | Step 9 below |
| 10 | Network disabled, a full pass | **PENDING** | — |
| 11 | Clean PC | **PENDING** (D14) | — |
| 12 | Windows 10 22H2 | **PENDING** (D14) | — |
| 13 | Performance on the target PC | **PENDING**: measured on the development PC only | "Memory and start-up" below |
| 14 | Physical printing | **PENDING** (D15) | — |
| 15 | USB and disk | **PENDING** (D15) | — |
| 16 | Excel opened in real Excel | **PENDING** | — |
| 17 | Khmer typing | **PENDING** | — |
| 18 | Release build | **NOT DONE for release.** The installer on disk is from 2026-11-05 23:43, **before the timetable**, and is stale. On 2026-11-06 `node scripts/build-all.mjs --dir --skip-tests` ran (version check, jar, extract, JRE, UI, **unpacked app, no installer**) and the packaged-app and hard-kill tests passed on that unpacked build. The full pipeline with the installer, **including its backend tests as one command**, has not been run for the release, and no final installer exists. It waits for the owner's approval | "Checks run on the final sources" below |
| 19 | Acceptance with the owner | **PENDING** | — |

## Built in Phase 6 so far

### D9 — a preferred fee currency
* Setting `fees.defaultCurrency` (KHR or USD, default **KHR**), validated by the backend (`INVALID_SETTING` for anything else). It only matters when **both** currencies are allowed: it is then first in the allowed list, which is what a new fee category starts in and what lists and the fee report show first. A preferred currency that is not allowed is ignored. **It changes no stored money, and nothing is converted or combined** (D10). Settings → Fees shows a "preferred currency" box when both are allowed.
* Evidence: `BackendFlowTest` order 58 (KHR until chosen, `EUR` refused, a new category starts in the preferred currency, an existing one keeps its own, the class totals are the same before and after, still one entry per currency, an unallowed preference is ignored); `npm run test -w frontend` (the preferences store: the order, the fallbacks); `e2e-app` check P4-26b.

### D12 — the icon (the owner's logo)
* **The owner supplied the KPSMS logo on 2026-11-05** (a blue rounded square with a golden Khmer-style roof, two pupils and an open book). The file was checked first: a **500×500** PNG, 32-bit with a **transparent background** (the corners have no colour), the picture itself inside a 10-pixel margin. It is kept exactly as given as `desktop/build/logo-source.png` (SHA-256 `25fd506a2e28a2f5ec0f546b62a279cad129f447851235edc176ade0faaa60eb`) and never edited.
* `desktop/scripts/make-icon.mjs` (run through Electron) makes `desktop/build/icon.png` (512 px) and `desktop/build/icon.ico` (16, 24, 32, 48, 64, 128, 256 px) from that file. Without the file it draws the simple "KP / SMS" monogram it was first written for. To change the icon: replace `logo-source.png` (a square PNG, at least 512 px is best), run the script, rebuild. The old placeholder generator `scripts/make-placeholder-icon.ps1` is no longer used.
* **Limits, said plainly:** the logo is 500 px, a little under the 512 px asked for, so the 512 px file is enlarged by 2 %; the 256 px entry of the icon is made smaller from it. At 16 px (the smallest size Windows uses) the details of the picture merge into a blue square with a golden roof; at 32 and 48 px the figures and the book can still be told apart. The logo was not redrawn or simplified for small sizes.
* Evidence: the `.ico` loads as a Windows icon (7 sizes); the rebuilt `KPSMS.exe` **and** `KPSMS-Setup-1.0.0.exe` were checked with `ExtractAssociatedIcon` and both show the logo; the file properties are unchanged (company "Nak", version 1.0.0); `e2e-packaged` passes 8 / 8 on the rebuilt program (run from the build folder, nothing installed). The Windows desktop and Start-menu shortcuts and the taskbar will show it only once the installer is run (D22): **that has not been seen**.

### D20 and D11 — two drafted pages for the school (unreviewed)
* `docs/HANDOVER-KM.html`: one Khmer A4 page (opening and signing in, attendance, printing a report card, backups, the recovery key, a blank line for whom to call). `docs/SMARTSCREEN-KM.html`: one page for the person who installs, about the Windows warning for the unsigned installer and how to check the SHA-256 (blank until release). The menu and button names are copied from the program's own wording. **Both were checked to print as exactly ONE page** with the program's own engine (`printToPDF`) and looked at as pictures.
* **Every word is AI-drafted and unreviewed (D19 is pending), and each page says so at the bottom ("ព្រាង").** The contact line is blank because nobody has said whom the school should call. What Windows shows on the school's PC was not seen. They must not go to the school before a Khmer speaker has read them.

### The window and layout for the target laptop (requirements 1–4 above)
* `desktop/src/main/windowSize.ts` (unit-tested: `desktop/test/windowSize.test.mjs`, 5 tests): the window is never larger than the work area, starts maximised on a screen narrower than 1600 or shorter than 860 logical pixels, and its minimum is 880×440 (never larger than the screen). `frontend/app/assets/css/layout.css`: the page minimum is 860×420. `frontend/app/layouts/default.vue`: the side menu collapses by itself below 1100 px and opens again above it; a person's own toggle wins; nothing is stored.
* **A bug found and fixed by my own new check:** the first version reopened the menu too late (a change watcher ran after the program had finished changing it and wrongly counted it as the person's own choice); it is now synchronous and `LY-menu-back` passes.

## Evidence by step

### Step 1 — the installer (PASS)
* Command: `npm run backend:build`, `node scripts/extract-backend.mjs`, `npm run generate -w frontend`, then `node desktop/scripts/package.mjs nsis` (all exited 0). Built twice: the first time with D9 and the icon, the second time with the window and layout change.
* **D21, the one-time download (what really was downloaded):** `electron-builder` fetched the Electron runtime zip (45.1.0), `7zip-win-x64`, `nsis-3.0.4.1` and `nsis-resources-3.4.1` into `%LOCALAPPDATA%\electron-builder\Cache` (a new folder in this Windows profile; nothing else in the profile was touched). They are build-time downloads; the installed program makes no run-time use of the network. The second build downloaded nothing. No antivirus block was met and nothing was worked around.
* **What is on disk now (re-read on 2026-11-06 after the final verification run):** `desktop/release/KPSMS-Setup-1.0.0.exe`, **237,432,560 bytes**, written **2026-11-05 23:43:06**, **SHA-256 `6060961b6472b15226375083e8182e93873b41fd2e459efe95f0c2b480bc7a5b`**, not signed (D11). It was built with the local-backup policy and **before the weekly timetable**: it is **database schema 9, not 10, so it is stale and must not be used or presented as the release candidate.** The final verification run changed neither its size, nor its time, nor its hash. The hashes written here earlier (`92D1E892…`, `782F4D44…`, `11C6445C…`) belong to builds that no longer exist: every rebuild gives a different file. **The number that counts is the one recorded after the final build, which has not been made.**

### Step 2 — icon and file properties (PASS)
Windows file properties of both `KPSMS-Setup-1.0.0.exe` and `win-unpacked\KPSMS.exe`: ProductName and FileDescription "Khmer Primary School Management System", CompanyName **Nak**, ProductVersion / FileVersion **1.0.0**, LegalCopyright "© 2026 Nak. All rights reserved." (so Electron's own company name is not shown). Both carry the new icon (see D12).

### Step 3 — hardening review (PASS for what is checkable without installing)
* **Electron fuses** read back from the built `KPSMS.exe` (`@electron/fuses`): RunAsNode **disabled**, EnableNodeOptionsEnvironmentVariable **disabled**, EnableNodeCliInspectArguments **disabled**, EnableEmbeddedAsarIntegrityValidation **enabled**, OnlyLoadAppFromAsar **enabled**, GrantFileProtocolExtraPrivileges **disabled** (EnableCookieEncryption and the browser-process V8 snapshot are off: the program stores no cookies and does not use a snapshot). The build log says the asar integrity resource was updated in the exe.
* **No administrator prompt:** the embedded manifests of both the installer and the program say `requestedExecutionLevel level="asInvoker"`. The installer settings in `desktop/scripts/package.mjs` are one-click, per-machine **false**, no choice of folder, shortcuts named KPSMS, `deleteAppDataOnUninstall` **false**. *This is configuration; what the installed program and the uninstaller really do waits for step 4.*
* **Window security** (`desktop/src/main/windows.ts`, `security.ts`): contextIsolation on, nodeIntegration off, sandbox on, webSecurity on; every permission request refused; new windows denied; navigation away from the program checked. F12 and Ctrl+Shift+I open no DevTools in the packaged program (checked, `e2e-packaged` 4).
* **No network calls in the built UI:** every absolute `http(s)://` string in `frontend/.output/public` was listed. They are the SVG / XLink / MathML namespace names, two documentation links inside Vue's and Nuxt's own error messages (text, never fetched) and two `*.invalid/probe/` base addresses inside a bundled library that parse relative web addresses (the `.invalid` name can never be reached). There is no address the program fetches. The real-shell suites also assert that only `app://school` and the local backend are contacted.

### Step 7 — antivirus (PENDING)
* `Get-MpComputerStatus`: **Windows Defender is not active on this PC** (`AntivirusEnabled False`, `AMServiceEnabled False`). The registered antivirus products are **"Reason Cybersecurity"** and "Windows Defender". So the planned Defender scan cannot be run, I did not try to switch Defender on (that is a Windows setting), and I have no way to read Reason Cybersecurity's verdicts.
* What was observed: the download of the tools, the builds, the writing of a 237 MB installer and of the unpacked folder (including `java.exe` under `resources\jre\bin`), and the running of the packaged program from that folder were not blocked, and the files were not removed (the first installer was still there, with the same SHA-256, a quarter of an hour later). That is **not** a scan result and is not recorded as a pass.
* Needed: the owner, or whoever manages this PC's security product, scans `KPSMS-Setup-1.0.0.exe` and the installed folder and says what the product does; and the same on the school laptop.

### Step 8 — a hard kill (PARTIAL: from the build folder, not installed)
* Test: `node desktop/test/e2e-killed.mjs` (new). The packaged `KPSMS.exe`, run from the build folder with a temporary data folder, goes through the first-run wizard, a pupil is recorded, and then **the program and its backend are ended at once with `taskkill /F /T`** (no chance to clean up: what a power cut or a crash leaves). Result **11 / 11 PASS**: the "running" marker is left behind; the next start works and shows the login page; the system health page says the previous shutdown was not clean and that the data was checked with no damage found; **the pupil recorded before the kill is still there**; a backup made after the kill is written and read back as good; a normal quit stops everything and removes the marker; the start after that shows no warning.
* **Said plainly:** the first two runs of the last check (the final quit) FAILED. The log showed that no quit had been started at all: my test fired the quit call and closed its connection at once, so the call was not always delivered. The test now waits for the call to be answered, and it then passed twice in a row. The program was not changed.
* **Not covered** (it needs the installed program and the owner's permission, D22): the installed program, restarting Windows, a real power cut on the laptop.

### Step 9 — layout (PASS in logical pixels; the real laptop is pending)
* Test: `node desktop/test/e2e-layout.mjs <a fictional sample school folder>` in the real shell on a scratch copy of the fictional sample school (26 pages from the side menu, 72 invented students; the copy is deleted afterwards). Seven workspaces: Full HD at 100 / 125 / 150 % (1920×1001, 1536×785, 1280×641), a 1366×768 laptop at 100 / 125 / 150 % (1366×689, 1093×535, 911×433) and the smallest window (880×409 of content). A window of the same logical size is used, so the layout is what it would be; the real display scaling, its font rendering, and the real laptop were **not** tested.
* **Result: `e2e-layout.mjs` 27 / 27 PASS** on the final build. At every one of the seven workspaces all 26 pages fit the window width (nothing scrolls sideways, nothing sticks out of the window outside a scrolling table) and none needs a scroll bar on the page itself (the content area scrolls inside the shell; the smallest window, 880×409, is allowed to). The side menu is open at 1920, 1536, 1366 and 1280 px and **collapses by itself** at 1093, 911 and 880 px; it opens again when the window widens to 1366 px and collapses again at 1000 px; a person who opens it on a narrow window keeps it open. The program itself opens with a window minimum of 880×440. No console error. Pictures: `desktop/test/out/layout-*.png` (for example `layout-fhd-150-students.png`: the 1280×641 workspace of Full HD at 150 %; `layout-hd-150-attendance.png`: the 911×433 workspace with the menu collapsed).
* The first run on 2026-11-05 (before the change) had failed at 1093 px and 911 px: `layout.css` gave the page `min-width: 1200px` and the window had a minimum width of 1200, so every page scrolled sideways there; that is what the owner's requirements removed. With the minimum lifted, the experiment had shown all 26 pages fit.

### Memory and start-up (the packaged program, run from the build folder on the DEVELOPMENT PC: i5-10400F, 16 GB; not the target laptop)
* `node desktop/test/e2e-packaged.mjs` — **8 / 8 PASS**: the packaged `KPSMS.exe` starts the bundled backend and JRE 21.0.6 (ready 9.7 s after launch in that run), serves the UI over `app://school/`, schema version 9, no DevTools, database and logs in the data folder (not next to the exe), and quit stops everything and removes the locks. **It is the first time the KPSMS build was run as a packaged program.**
* `node scripts/measure-app.mjs` (3 starts, 45 s idle on the login page, no debugger): window shown after **6.8 s (first launch, empty database), 6.3 s and 6.3 s (warm)**; backend ready after 5.6 / 5.1 / 5.1 s; idle memory of all the program's processes **608 MB (Electron 345 + Java 263)**; the e2e run above showed 578 MB. Budgets (`docs/PHASE0-ARCHITECTURE.md` §4C.2): cold start ≤ 8 s on the development PC, ≤ 15 s on an i3 with an SSD; idle memory ≤ 800 MB: **met on this PC**.
* What this does and does not say about an 8 GB laptop: this PC gives the backend a 512 MB heap (16 GB); the laptop will be given 384 MB (6–8 GB). The Phase 5 measurement (`docs/PERF-LOG.md`) found the idle Java working set the same at 384 MB and at 512 MB (264 MB), and the whole program about 590 MB at idle with a peak of 867–954 MB during a 40-card PDF (budget 1.2 GB). On an 8 GB machine that is a small share, but **a laptop with other programs open, an i5 11th generation CPU and Windows 11 were not measured**: the start-up time and the memory on the real laptop stay **PENDING** (step 13). The Low-memory preset is kept.

## Release-build preparation (2026-11-06, while the final installer is on hold)
What was done so that the final installer can be built **immediately** after the Khmer review and the owner's separate approval, without building it now. **No program code, database or school data was changed, and no installer was built.**
* **`node scripts/release-preflight.mjs`** (new, read-only; `npm run release:preflight`): **READY TO BUILD, no warning.** Node 24.22.1; the release metadata consistent (KPSMS 1.0.0, Stable); JDK 21.0.6 with `jlink` and `jmods`; the Maven wrapper; Electron and electron-builder installed; the packager's tools **cached offline** (NSIS 3.0.4.1, NSIS resources 3.4.1, 7-zip, the Electron runtime zip), so the build needs no download; the icon files and **the owner's logo unchanged** (SHA-256 matches); **344.6 GB** free; no `KPSMS.exe` running; and the stale installer **untouched** (237,432,560 bytes, written 2026-11-05 23:43, SHA-256 `6060961b…7a5b`).
* **A fingerprint of the sources:** `node scripts/release-preflight.mjs --snapshot` wrote `docs/RELEASE-SNAPSHOT.json` (the SHA-256 of **697** source files that go into the build). After the review, `--compare` lists exactly what changed and says whether **only** `frontend/i18n/locales/km.json` and `frontend/i18n/REVIEW.md` differ. Right now it says 0 changed, 0 added, 0 removed.
* **The Khmer review, ready to take in:** `docs/KHMER-REVIEW-SHEET-19.md` (all **142** texts of §19 in full, with a column for the correction) and `node scripts/khmer-review.mjs apply <corrections.json>` (`npm run khmer:review`): a dry run by default; all or nothing; it refuses a key that does not exist, a text outside §19, a lost or renamed `{word}` and the characters `|`, `@`, `<`; with `--write` it rewrites `km.json` byte for byte except the corrected texts and writes the before / after report `docs/KHMER-REVIEW-OUTCOME-19.md`. Tested: `desktop/test/khmerReview.test.mjs` **8 / 8** (the desktop unit tests are now **34 / 34**), a dry run on the real file (a bad corrections file was refused with the reason for each of its 3 problems; a good one showed before / after; the file's hash did not change), and a `--write` run on a **throwaway copy** (exactly one line changed, the CRLF line endings were kept, the report was written, the real `km.json` was not touched).
* **The stale installer is marked on disk:** `desktop/release/README-STALE-INSTALLER.txt` says it is stale, why, and that it is not to be used or given to the school. The installer file itself was not opened, renamed or modified (its size, time and SHA-256 were read again after everything above).
* **The runbook:** `docs/RELEASE-BUILD-RUNBOOK.md` — Part A (taking in the review, up to showing the owner), Part B (only after the owner's separate approval: preflight, the one build command, recording the new installer, deleting the stale note, testing the unpacked build, and **not** running D22).
* **Said plainly:** none of the review tooling has been used on a real review, because there has been no review yet; the real `km.json` and §19 are exactly as before. The review itself, the build, and every pending item below are **not** done.

## Checks run on the final sources (2026-11-06, the weekly-timetable round)

**Sources:** everything built so far, including migration V10 (the weekly timetable), the local-backup policy, homework (V9), sub-subjects (V8) and the readiness item `timetable-slots` (development COMPLETED, school side "configuration pending"). **Build:** `node scripts/build-all.mjs --dir --skip-tests` (release-metadata check, backend jar, extract, JRE, UI, **unpacked app in `desktop/release/win-unpacked`; no installer**). **Nothing was installed or uninstalled, no school data was touched** (every real-shell suite runs on its own temporary data folder; the layout suite on a scratch copy of the fictional sample school that is deleted afterwards).

### The final run (one script, 00:50–00:56; every step exited 0)
| Suite | Command | Result (output read) |
|---|---|---|
| Release metadata | `node scripts/version.mjs check` | consistent: KPSMS 1.0.0 (Stable) |
| Backend, on a clean `target` | `node scripts/run-mvn.mjs test` | **157 run, 0 failures, 0 errors, 0 skipped** (it was 152: `MigrationV10Test` 2, `TimetableIndependenceTest` 2, `BackendFlowTest` order 66) |
| Frontend type check | `npm run typecheck -w frontend` | clean |
| Frontend unit tests | `npm run test -w frontend` | **464 / 464** in 22 files (it was 432: `timetable.test.ts` 32) |
| Desktop unit tests | `npm run test:desktop` | **26 / 26** (`version.test.mjs` now expects 13 readiness items) |
| Real shell: the changes round | `node desktop/test/e2e-changes.mjs` | **93 passed**, ALL CHECKS PASSED |
| Real shell: start-up and security | `node desktop/test/e2e-shell.mjs` | **30 passed**, ALL CHECKS PASSED |
| Real shell: the weekly timetable (new) | `node desktop/test/e2e-timetable.mjs` | **59 passed**, ALL CHECKS PASSED |
| **Packaged app** (unpacked build, not installed) | `node desktop/test/e2e-packaged.mjs` | **8 / 8**: starts the bundled backend and JRE, **database schema version 10**, UI over `app://school/`, no DevTools, data and logs in the data folder, quit stops everything |
| **Hard kill** (unpacked build, not installed) | `node desktop/test/e2e-killed.mjs` | **11 / 11**: a pupil is recorded, the program and its backend are ended with `taskkill /F /T`, the next start works, the health page says the shutdown was not clean and the data was checked with no damage, the pupil is still there, a backup after the kill is read back as good, a normal quit leaves no marker |
| **Backup flow** | `node scripts/test-backup-flow.mjs` | **40 checks PASS, 0 FAIL, "ALL PASSED"**: backup on close, the upgrade backup made at the old schema, manual backup, refusal of a non-backup and of a damaged one, staged restore applied at the next start (also after a crash), the safety backup, the log holds no password or path |
| **Hand-over guide** | the program's own print engine (`printToPDF`, `preferCSSPageSize`) on `docs/HANDOVER-KM.html` | **PAGES=1**, an A4 portrait page (594.96 × 841.92 pt): **exactly one A4 page**, rechecked after its backup section was rewritten |

### The rest of the existing real-shell suites, run earlier the same day on the unpackaged shell (the sources were the same, except the one readiness flag below)
`e2e-app` **157**, `e2e-honor` **48**, `e2e-ranking` **51**, `e2e-subjects` **50**, `e2e-lists` **18**, `e2e-homework` **47**, `e2e-backup` **53**, `e2e-layout` **27** (a scratch copy of the fictional sample school; it visits every side-menu page, including the two new timetable pages, at the seven workspaces), `e2e-timetable` **59**, `e2e-changes` **94** and `e2e-shell` **30** (each: ALL CHECKS PASSED). After that run the item `timetable-slots` was changed from "development in progress" to "development completed" (it was set once the tests had passed); that can only change the About page's counts, so `e2e-changes` was run again in the final run (**93**, one fewer: there is no longer an unfinished item whose sign-off button is checked), and the backend suite and the unpacked build were redone. The other suites were **not** run again after that flag.

### Failures, flaky behaviour, skips and warnings (all of it)
* **Skipped tests: none** (Maven reports 0; the other runners have no skip).
* **Failures found and fixed during this round, in order** (none is left): the first full backend run failed 3 tests (my flow test read a class id from the wrong place; `ProductInfoTest` and then `desktop/test/version.test.mjs` still expected 12 readiness items; a comment in `TimetableService` contained a word the independence scan forbids) · the first real-shell runs of `e2e-timetable` failed on **one real defect of the program** (the editor hid every slot the class did not use as soon as the first lesson was placed, so the next lesson could not be added: it now draws every slot by default, with a switch to hide the unused ones) and on **test-only problems** (reading a cell before the grid was redrawn, an older toast with the same words still fading, `tar` on the PATH being a GNU tar that cannot read a zip so Windows' own `tar.exe` is used, a snapshot that included the "closed" flag of the very year it closed) · at 1366×768 and 150 % a six-day week scrolled **inside** its frame by 61 px (789 in 728); the minimum widths were reduced and it now fits (728 in 728); a seven-day week still scrolls inside the frame, by design.
* **Flaky behaviour: one.** `e2e-honor` failed once in an earlier batch of this round with a harness error (`page.screenshot: Timeout 30000ms exceeded`) after 35 checks had passed. It then passed **four times in a row** (three alone, once in the full chain: 48 checks each, identical check ids). **The cause was not found and is not proven**; load on the PC at that moment is a guess. It is a watch item, not a fixed one.
* **Warnings seen, none a program fault:** `WARN` lines in the backend run are tests that deliberately ask for an unknown backup id and for unsupported HTTP verbs; the JDK prints its notice that a test library (Mockito's ByteBuddy agent) loads dynamically; the compiler notes a pre-existing deprecated Spring constant (`HttpStatus.UNPROCESSABLE_ENTITY`); the desktop unit tests log the warnings of the bad-configuration cases they test; the build script prints Node's `DEP0190` notice about its own `shell: true`.
* **One timing to read with care:** in `e2e-packaged` the bundled backend was ready 14.3 s after launch (the log says 5.2 s after the Java process started). The earlier recorded run said 9.7 s. The executable had just been built and Windows scans a fresh executable on its first run; **it was run once and is not a performance measurement**, and the figures of step 13 are unchanged and still development-PC only.
* **An observation about the fictional sample school (`.sample-data`), not caused by any command of this round.** Its logs show that at **00:51:26 on 2026-11-06 the program was started on it** (unpackaged, on the backend jar the final run had just built), **migrated its database from schema 9 to 10** (an automatic pre-upgrade backup, `backups/auto/SchoolBackup_2026-11-06_00-51-27.zip`, was made first), and **stopped gracefully at 00:52:09**. None of this round's suites uses that folder (each uses its own temporary data folder, and the layout suite a scratch copy that is deleted), and no script of mine starts it, so it was started by someone else, most likely the owner opening the sample school; nothing was deleted or overwritten. **Consequence to know:** that sample database is now at schema 10, so the stale installer of 2026-11-05 (schema 9) could no longer open it, which is the intended "no way back" of every migration (`docs/TIMETABLE-PLAN.md` §5). It holds no real school data.

### What this evidence does NOT show
The school's real timetable (nobody has given one); a class of 40 with a full week of real names; **physical printing** (every printout was checked as a real PDF and by measurement); the Excel files opened in **real Excel** (they were written by the real button and read back from the file, not opened in Excel); the **Dell laptop** (its real display scaling, memory and speed); Khmer typing; Windows 10; a clean PC; a real USB stick; the **installed** program (D22); antivirus (step 7). The Khmer wording of the timetable is my own and unreviewed (`frontend/i18n/REVIEW.md` §19).

### Superseded
The list of 2026-11-05 (backend 147, frontend 431, `e2e-backup` 48, and the statement that the installer in `desktop/release` was the build that was tested) is replaced by the above. The installer of 2026-11-05 was tested only through the unpacked folder built beside it, and is now stale.

## Checks run on the final sources (2026-11-06, the dashboard round)

**Sources:** everything above plus the dashboard enlargement (a hero and six read-only charts, `GET /api/v1/dashboard/charts`, `frontend/i18n/REVIEW.md` §20). **No migration, no database change, no school data touched** (every real-shell suite runs on its own temporary data folder; the layout suite on a scratch copy of the fictional sample school that is deleted afterwards; the dashboard suite on scratch copies it deletes). **No installer was built and nothing was installed**: the only build made was the unpacked app (`node scripts/build-all.mjs --dir --skip-tests`). **The stale installer is byte for byte what it was**: `desktop/release/KPSMS-Setup-1.0.0.exe`, 237,432,560 bytes, 2026-11-05 23:43:06, SHA-256 `6060961b…7a5b`, fingerprinted by `sha256sum` at the start and at the end of both full runs (identical each time).

### The final run (one script, 02:22–02:41, every step exited 0; all output read)
| Suite | Command | Result |
|---|---|---|
| Release metadata | `node scripts/version.mjs check` | consistent: KPSMS 1.0.0 (Stable) |
| Backend, on a clean `target` | `node scripts/run-mvn.mjs test` | **158 run, 0 failures, 0 errors, 0 skipped** (it was 157: `BackendFlowTest` order 67 is new) |
| Frontend type check | `npm run typecheck -w frontend` | clean |
| Frontend unit tests | `npm run test -w frontend` | **485 / 485** in 23 files (it was 464 in 22: `charts.test.ts` 21) |
| Desktop unit tests | `npm run test:desktop` | **36 / 36** (it was 26: `khmerReview.test.mjs` 10, of which 2 are new for §20) |
| Real shell: start-up and security | `e2e-shell.mjs` | **30**, ALL CHECKS PASSED |
| Real shell: the UI | `e2e-app.mjs` | **157**, ALL CHECKS PASSED |
| Real shell: the change round | `e2e-changes.mjs` | **93**, ALL CHECKS PASSED |
| Real shell: roll of honour | `e2e-honor.mjs` | **48**, ALL CHECKS PASSED |
| Real shell: monthly ranking | `e2e-ranking.mjs` | **51**, ALL CHECKS PASSED |
| Real shell: subjects | `e2e-subjects.mjs` | **50**, ALL CHECKS PASSED |
| Real shell: paged lists | `e2e-lists.mjs` | **18**, ALL CHECKS PASSED |
| Real shell: homework | `e2e-homework.mjs` | **47**, ALL CHECKS PASSED |
| Real shell: backups | `e2e-backup.mjs` | **53**, ALL CHECKS PASSED |
| Real shell: the weekly timetable | `e2e-timetable.mjs` | **59**, ALL CHECKS PASSED |
| **Real shell: the dashboard (new)** | `e2e-dashboard.mjs` (`npm run e2e:dashboard`) | **39**, ALL CHECKS PASSED (three launches: a school with nothing, the fictional sample school, the Low-memory preset) |
| Real shell: window sizes | `e2e-layout.mjs <a fresh scratch copy of the sample school>` | **27**, ALL CHECKS PASSED (26 pages, seven workspaces) |
| **Packaged app** (unpacked, not installed) | `e2e-packaged.mjs` | **8 / 8**, database schema version **10** |
| **Hard kill** (unpacked, not installed) | `e2e-killed.mjs` | **11 / 11** |
| **Backup flow** | `node scripts/test-backup-flow.mjs` | **41 PASS lines, 0 FAIL, "ALL PASSED"** |
| **Hand-over guide** | the program's own print engine on `docs/HANDOVER-KM.html` | **PAGES=1** (one A4 page, unchanged) |
| Release preflight (read-only) | `node scripts/release-preflight.mjs` | every check PASS, "READY TO BUILD" (this means the build is technically possible; **the build is on hold**); the sources equal the new snapshot |
| Source fingerprint | `--snapshot`, then `--compare` | **707 files** (it was 697); 0 changed, 0 added, 0 removed against the new snapshot. Against the OLD snapshot (before the dashboard) exactly **13 files changed and 10 added, 0 removed**: the dashboard's backend service and controller, the flow test, the frontend page, components, utilities, styles, icon list, types, API service, `km.json`, `REVIEW.md`, the Khmer-review tool (§20) and the `e2e:dashboard` line of `package.json`. No migration and no timetable file is among them |

### What the dashboard suite proves (`e2e-dashboard.mjs`, 39 checks)
The figures are on the screen while the charts' answer is held back for 3 s (five quiet placeholders, no spinner, no error); a school with no year and no student says so in every chart; the hero; every chart equals the API's own answer (students by grade, gender totals, class fill, the latest examination's class averages and its pass / fail / not-complete split, attendance days, fees blocks per currency); "show as table"; one tab stop per chart, the arrow keys, Home and End, a tap on a legend entry; a day nobody recorded is drawn as a **gap** (two hatched bands, **no mark on the 0 % line**, no line piece, the day's own sentence); students of unknown gender stay in the total (30 + 39 + 3 = 72); a class with no capacity stored shows its head count alone; two currencies are two blocks, nothing added or converted; no current year; a failed load with "try again"; the bars animate on the Standard preset and **do not** for reduced motion or on the Low-memory preset; **no sideways page scrolling and nothing sticking out of its card at Full HD and 1366×768 at 100 / 125 / 150 %** (six workspaces); the charts say nothing about the timetable or homework; nothing is stored in the browser, no console error, no CSP violation, only `app://school` and the local backend contacted. `BackendFlowTest` order 67 proves the endpoint **read-only** (the row count of every table before and after) and every figure against SQL and against the report cards' own results, on a scratch year.

### Failures, flaky behaviour, skips and warnings (all of it)
* **Skipped tests: none** (Maven reports 0; `node --test` reports 0 skipped).
* **The first full run (02:01–02:20) had two real-shell failures; the second (02:22–02:41), after the fixes below, had none.** Both runs are summarised here because the first is why the second was needed:
  * `e2e-app` **P4-2** failed (156 of 157). **A regression of mine, in a test hook the owner asked to keep unchanged:** the test reads the parent element of the attendance figure to find today's split, and my new tile wrapped the figure and the little trend in a new element, so the split was no longer inside that parent. **Fixed in the page** (the figure is a direct child of the card body again, the trend floats beside it) and a check (`DB-B2`) now guards it.
  * `e2e-ranking` **RK-1c** failed (50 of 51) in the chain, **passed 51 / 51 when run alone**, and passed in the second full chain. **Flaky; the cause is not proven.** The check counted the preview's rows right after the page opened, while the page was "ready" as soon as the open button worked, so the preview's own answer could still be on its way; a wait for the 13 rows (the one `pickClass` already uses) was added to that check. That is a probable cause, not a proven one; it is a watch item, like the `e2e-honor` screenshot timeout of the previous round (which did not recur in either run).
* **Other failures found and fixed during the round, before the runs above:** the first real-app run of `e2e-dashboard` ended after its first launch with no summary: **a fault of the test** (it re-fetched the charts with `route.fetch()`, which bypasses the launch secret that the shell adds inside the main process, so the backend refused it and my code then failed on a missing field; it now serves an altered copy of the real answer). **Two defects of the program found by looking at the real screenshots, which no check had caught:** the hollow markers of an unrecorded day sat on the 0 % line and read as "zero" (they are now a hatched band with nothing on the line, and a check asserts it); and the Khmer word អវត្តមាន was broken into អ + វត្តមាន across two lines in the attendance tile at 1366 px (each item of the split is now kept whole, and a check asserts it). The fees card also opened on the oldest month; it now opens on the newest. Type-check findings during development (a prop that must not be called `ariaLabel`, two auto-imported names that collided, a possibly empty value) were fixed before any run.
* **Wording changed by me before the review (not a reviewer's correction):** the attendance sentence no longer says "working days" (the program has no school calendar; a holiday is also a day with no record), and the dashed line of the capacity mark uses the ordinary words. Both are listed in `REVIEW.md` §20. **No correction from a reviewer has been applied; there has been no review yet.**
* **Warnings seen, none a program fault:** the same backend `WARN` lines of tests that ask for an unknown backup id and unsupported HTTP verbs; the JDK's notice that a test library loads dynamically; the compiler's note about a deprecated Spring constant; the desktop unit tests' log of their bad-configuration cases; Node's `DEP0190` notice from the build script; the Nuxt build's `PLUGIN_TIMINGS` notice about build time.

### What this evidence does NOT show
**The real laptop** (the Dell's display scaling, memory and speed: the six workspaces are CSS-pixel windows of the right size on this PC, so the layout is proved and the font rendering is not); **a native speaker's reading of the dashboard wording** (§20 is my own Khmer; 67 texts); **physical printing** (the dashboard is hidden in print media, but no printout of it was made or checked); **the speed of the charts' answer on a school of about 1,000 students** (the sample school has 72 students and seven classes; no timing of the endpoint was taken); Khmer typing; the real timetable; Windows 10; a clean PC; a real USB stick; real Excel; the installed program (D22); antivirus (step 7). **The final installer is not built and the application is not declared release-ready.**

## Checks run after the quiet backup line (2026-11-06, the owner's request to cut the dashboard's noise)

**What changed:** the dashboard's backup status is **one quiet line** (a check mark, the title, the message, an information button and a link to the Backup page; no coloured box) while a good backup is under 24 hours old; the complete note of what a backup kept only on the laptop cannot protect against opens from the information button (closed by default). The yellow warning box (no good backup, or the newest one 24 hours old or more) is **unchanged**. **No backup logic, 24-hour rule, retention, trigger or storage location was touched; no migration; no school data; no installer; no D22.** Five source files differ from the previous fingerprint (`BackupBanner.vue`, `components.css`, `km.json` (one new text), `REVIEW.md`, `scripts/lib/khmerReview.mjs`). The stale installer is byte for byte what it was (237,432,560 bytes, SHA-256 `6060961b…7a5b`, fingerprinted before and after both chains).

### The final run (17:39–17:57, one script, every step exited 0; all output read)
| Suite | Result |
|---|---|
| Release metadata check | consistent: KPSMS 1.0.0 (Stable) |
| Frontend type check | clean |
| Frontend unit tests | **485 / 485** in 23 files |
| Desktop unit tests | **36 / 36** (the review tool's tests now pin the new label into §20 and keep the sentence it opens out of it) |
| `generate` and the desktop build | exit 0 |
| `e2e-shell` / `e2e-app` / `e2e-changes` | **30** / **157** / **93**, ALL CHECKS PASSED |
| `e2e-honor` / `e2e-ranking` / `e2e-subjects` | **48** / **51** / **50** |
| `e2e-lists` / `e2e-homework` | **18** / **47** |
| **`e2e-backup`** | **58** (it was 53: P5-2e is rewritten, P5-2f, 2g, 2h, 2i and 2j are new; P5-0c is stricter) |
| `e2e-timetable` / `e2e-dashboard` / `e2e-layout` | **59** / **39** / **27** |

**Not re-run, because nothing in them changed:** the backend tests (158 on the previous round) and the unpacked-build tests (`e2e-packaged`, `e2e-killed`, the backup flow); the unpacked build of the previous round does not contain this change. The hand-over guide was not touched (it still says, in its warning, that a backup on the laptop does not protect against a failed SSD, theft or physical damage).

### What the new checks prove (`e2e-backup.mjs`, real Electron shell)
* **P5-2e** a good backup under a day old: a quiet line, not an `.alert` box, a transparent background, `role="status"`, **36 px high where the yellow box was 107 px**, the Khmer title, a link to the Backup page, no "back up now" button, and the limits note **hidden by default** (not in the visible text).
* **P5-2f** the information button is a real `button` with an icon **and** the new Khmer words, starts with `aria-expanded="false"`, `aria-controls` points at the note, `tabindex` 0, **199 × 36 px** (at least 32 high and 44 wide).
* **P5-2g** keyboard alone: Enter opens, Space closes; the opened text equals the existing sentence word for word and contains SSD, a stolen or lost laptop and physical damage.
* **P5-2h** a **real touch event** through the browser (not a mouse click) opens it; a mouse click closes it.
* **P5-2i** with the health answer replaced on its way to the page by one that says the newest good backup is 30 hours old: the yellow `.alert-warning` box, role alert, the Khmer title and the 30 hours, the limits note **always visible**, the "back up now" button, no information button, no quiet line. **P5-0c** (no backup yet) now asserts the same things on the real flow.
* **P5-2j** the smallest window (880 px): the button, the link and the opened note are all inside the window, nothing is cut off, the page does not scroll sideways (the line with the note open is 101 px high).

### Failures, defects found, flaky behaviour, skips and warnings (all of it)
* **Skipped tests: none** (`node --test` reports 0 skipped). **Flaky behaviour: none seen** (the `e2e-ranking` RK-1c that failed once in the previous round passed).
* **My own test code failed once:** the first run of the new narrow-window helper stopped with `ReferenceError: fn is not defined` (a function sent to Electron's main process cannot see the variables around it); the function is now passed in as an argument. Not a program fault.
* **A defect of the program found only by looking at the screenshot at 880 px:** the "Backup page" link dropped to a row of its own at the far left, away from the button. The button and the link are now one group that wraps together and stays right-aligned; P5-2j and the screenshots were redone on the final build.
* **The first run of the final chain was killed** during `nuxt generate` (Windows code 3221226091, 0xC000026B, which is what a process gets when its console is torn down) at the moment the session's environment restarted; **it did not reach the real-shell suites**. It is almost certainly environmental, but that is not proven. The whole chain was run again from the start and passed; the results above are from that second run.
* **Warnings seen, none a program fault:** the same ones as the previous round (backend test `WARN` lines, the JDK's dynamic-agent notice, Node's `DEP0190`, the Nuxt build's `PLUGIN_TIMINGS`).

### What this evidence does NOT show
**The real laptop's display and a real finger on a touch screen** (the touch event is sent through the browser, which proves the handler, not the hardware); **a screen reader** (the labelling is asserted in the page, but no screen reader was run); **a native speaker's reading** of the new label "ដែនកំណត់នៃការបម្រុងទុកនេះ" (my own Khmer, `REVIEW.md` §20; the reviewer's sheet now has 210 texts); printing (the line is not meant to be printed); the installed program (D22). **The final installer is not built and the application is not declared release-ready.**

## The Khmer review of §19 and §20: the owner's confirmation (2026-11-06)

**What the owner said:** the Khmer wording of `frontend/i18n/REVIEW.md` §19 (the timetable) and §20 (the dashboard, including the backup line's label) is **acceptable**; the owner asked that the documents record it, that no unnecessary wording be changed, and that the installer build stay on hold until the owner's separate approval of `node scripts/build-all.mjs`. **No correction was returned, so no text was changed.**

**What was run (each command's output read):**
* `node scripts/khmer-review.mjs apply <an empty corrections file>` (the **dry run**): "0 text(s) would change", nothing written.
* The same with `--write --reviewer "the owner (confirmed the wording acceptable, no corrections)"`: it wrote `docs/KHMER-REVIEW-OUTCOME-19-20.md` (210 texts in the sections, **corrected: 0**, left as they were: 210, "Nothing was changed"). **`frontend/i18n/locales/km.json` is byte for byte the same file**: SHA-256 `c309b4678fd1fad1aba65adce24b6436c06b078d65736018f7bc2592d8b4db5d` before and after, still CRLF.
* `node scripts/release-preflight.mjs --compare` (before the snapshot was retaken): **"ONLY the Khmer wording files differ"**: one file, `frontend/i18n/REVIEW.md`, which only gained a status line under the §19 and §20 headings (the text below each stays as it was drafted). The snapshot was retaken: **707 files, 0 differences**.
* `npm run typecheck -w frontend` clean; `npm run test -w frontend` **485 / 485**; `npm run test:desktop` **36 / 36**.
* **The real-shell suites were not run again:** no text on any screen changed (`km.json` is identical to the file the run of 17:39–17:57 was generated from), so the results in "Checks run after the quiet backup line" are the results for these exact texts.
* `node scripts/release-preflight.mjs` (read-only): **every check PASS, "READY TO BUILD"** (this means a build is technically possible; **it has not been started and is on hold**). The stale installer is untouched: 237,432,560 bytes, 2026-11-05 23:43, SHA-256 `6060961b…7a5b`.

**What this is not:** it is the owner's confirmation of §19 and §20 only. It is **not** a review of §1–§18 or of the two Khmer pages (hand-over guide, SmartScreen page), which stay pending (D19), and it **does not sign off the readiness item `khmer-wording`** (the administrator's act in Settings → About). **The final installer is not built and the application is not declared release-ready.**

## Checks run after the name change (2026-11-06, the owner's request: developer / reference name "PHEA NAK")

**What changed:** `release/release.json` (`developer` "PHEA NAK", `copyright` "© 2026 PHEA NAK. All rights reserved."), `desktop/package.json` (`author`, by `node scripts/version.mjs sync`), one test fixture and documents. **No behaviour, no migration, no school data, no installer, no D22.** `node scripts/release-preflight.mjs --compare` before the snapshot was retaken: **2 changed, 0 added, 0 removed** (exactly `desktop/package.json` and `release/release.json`).

### The run (19:34–19:54, one script, every step exited 0; all output read)
| Suite | Result |
|---|---|
| Release metadata check | consistent: KPSMS 1.0.0 (Stable) (it failed before `sync`, as designed) |
| Backend tests (clean build) | 158 / 158, BUILD SUCCESS |
| Frontend type check | clean |
| Frontend unit tests | 485 / 485 (23 files) |
| Desktop unit tests | 36 / 36 |
| e2e-shell / e2e-app / e2e-changes / e2e-honor | 30 / 157 / 93 / 48, all passed |
| e2e-ranking / e2e-subjects / e2e-lists / e2e-homework | 51 / 50 / 18 / 47, all passed |
| e2e-backup / e2e-timetable / e2e-dashboard / layout | 58 / 59 / 39 / 27, all passed |
| Unpacked build (`build-all.mjs --dir --skip-tests`, no installer) | exit 0 |
| e2e-packaged / e2e-killed / test-backup-flow | 8 / 11 / ALL PASSED |
| Hand-over guide (the program's own print engine) | 1 page |

**File properties of the unpacked `KPSMS.exe` (read with PowerShell):** CompanyName "PHEA NAK", LegalCopyright "© 2026 PHEA NAK. All rights reserved.", ProductName "Khmer Primary School Management System", FileVersion 1.0.0.

**The stale installer was untouched:** 237,432,560 bytes, 2026-11-05 23:43, SHA-256 `6060961b6472b15226375083e8182e93873b41fd2e459efe95f0c2b480bc7a5b` before and after; it still shows "Nak" in its file properties (`desktop/release/README-STALE-INSTALLER.txt` says so). **The fingerprint snapshot was retaken: 707 files, 0 differences**; the plain `node scripts/release-preflight.mjs` (read-only) passes every check and says "READY TO BUILD" (a build is technically possible; **it has not been started and is on hold**).

**Not verified:** the installer's file properties (no installer was built); the About page was not looked at again after the change (the unit test and the shell checks read the identity, no picture was taken). **The final installer is not built and the application is not declared release-ready.**

## Checks run after the roll-of-honour artwork expansion (2026-11-06, ten more styles, 20 in all)

**What changed:** the ten new styles (see `docs/CHANGE-ROUND-PROGRESS.md`, thirteenth round), 5 source files differ from the snapshot of the name change (`honorArt.ts`, `AppSettingsService.java`, `BackendFlowTest.java`, `km.json`, `REVIEW.md`), plus tests and documents. **No migration, no database record, no school data, no installer, no D22.** The snapshot was retaken afterwards: 707 files, 0 differences.

### The final run (20:55–21:16, one script, every step exited 0; all output read)
| Suite | Result |
|---|---|
| Release metadata check | consistent: KPSMS 1.0.0 (Stable) |
| Backend tests (clean build) | 158 / 158, BUILD SUCCESS (order 61 now saves all 20 style ids through the real API) |
| Frontend type check | clean |
| Frontend unit tests | 519 / 519 (485 before; 34 new, among them the fingerprints of the original ten styles) |
| Desktop unit tests | 36 / 36 |
| e2e-shell / e2e-app / e2e-changes | 30 / 157 / 93, all passed |
| **e2e-honor** | **55 / 55**: all 20 styles x {5, 10} names (40 sheets) each one A4 page, in the real PDF too (HR-6); the real text laid over the real artwork, 0 shared pixels in the ten new styles (HR-6b), in the worst case (HR-9c) and with stacked-mark names and very long signature names (HR-6f); the geometry of the drawings (HR-6e); light-ink and grey measures (HR-6d); the original ten only reported (HR-6c, HR-6g) |
| e2e-ranking / e2e-subjects / e2e-lists / e2e-homework | 51 / 50 / 18 / 47, all passed |
| e2e-backup / e2e-timetable / e2e-dashboard / layout | 58 / 59 / 39 / 27, all passed |
| Unpacked build (`build-all.mjs --dir --skip-tests`, no installer) | exit 0 |
| e2e-packaged / e2e-killed / test-backup-flow | 8 / 11 / ALL PASSED (these do not print a roll of honour) |
| Hand-over guide (the program's own print engine) | 1 page |

**The stale installer was untouched:** 237,432,560 bytes, 2026-11-05 23:43, SHA-256 `6060961b6472b15226375083e8182e93873b41fd2e459efe95f0c2b480bc7a5b` before and after. The plain `node scripts/release-preflight.mjs` (read-only) passes every check and says "READY TO BUILD" (a build is technically possible; **it has not been started and is on hold**).

**A loose end, closed:** a first full run was stopped half-way when the owner changed the flag style (the sources were about to change); stopping it left the test application it had started open, so I closed that test process tree (the test app, its helper processes and its own backend; nothing of the school's, and not the editor's Java process) before running the whole chain again from the start.

**Not verified:** physical printing; the artwork by a Khmer teacher or designer; the ten Khmer names (my own); the thin lines of vintage and modern on a real printer. **The final installer is not built and the application is not declared release-ready.**

## Other things written in Phase 6 (nothing here is claimed beyond what was run)
* New tests: `desktop/test/windowSize.test.mjs` (5), `desktop/test/e2e-layout.mjs`, `desktop/test/e2e-killed.mjs`. Everything that was added to the program is listed in `CHANGELOG.md`.

## Still to do in Phase 6 (nothing here is claimed done)
* **The Khmer review of `frontend/i18n/REVIEW.md` §19 and §20 (the sheet `docs/KHMER-REVIEW-SHEET-19-20.md`, 210 texts) is DONE: the owner confirmed the wording acceptable on 2026-11-06 with no correction (`docs/KHMER-REVIEW-OUTCOME-19-20.md`). What is left is the owner's separate approval, then the build.** The final installer is **on hold** (owner, 2026-11-06). After the review: show the owner the outcome report and every change (`docs/RELEASE-BUILD-RUNBOOK.md` Part A); only then, on the owner's separate approval, `node scripts/build-all.mjs` (version check, backend tests, jar, JRE, UI, installer), and record its size and SHA-256 here. The stale `KPSMS-Setup-1.0.0.exe` of 2026-11-05 is replaced by it, and its marker note is deleted. Until then **no final installer exists.**
* Fill the SHA-256 into `docs/SMARTSCREEN-KM.html` after that build, and have both Khmer pages and `frontend/i18n/REVIEW.md` §1–§18 read by a native speaker (D19); §19 and §20 were confirmed acceptable by the owner on 2026-11-06.
* Steps 4, 5, 6 and 8 (installed): **only after the owner explicitly approves D22** and confirms that this Windows profile has no existing school data or installation.
* Steps 7 and 10–17 and 19 need the owner and the equipment: the school laptop (Windows version and scaling to confirm), the printer, Khmer typing, a USB stick, a clean PC, Windows 10, real Excel, an antivirus scan.
* **From the school:** the real days and slots of the timetable (typed into Settings → Timetable and signed off in Settings → About), the real attendance sessions, the real grading rules and a sample report card, which counting method is official.
* Update `docs/FINAL-SCHOOL-ACCEPTANCE.md` and the About page's readiness list only for what is proved.
