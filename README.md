# School Management — offline Khmer primary-school system (Windows desktop)

One Windows PC, no internet needed. Electron shell + Nuxt 4 UI + Spring Boot 4.1 backend (Java 21) + SQLite.
Architecture and decisions: [docs/PHASE0-ARCHITECTURE.md](docs/PHASE0-ARCHITECTURE.md). Status and evidence: [docs/PHASE1-PROGRESS.md](docs/PHASE1-PROGRESS.md). Measurements: [docs/PERF-LOG.md](docs/PERF-LOG.md).

```
backend/    Spring Boot 4.1.x, Java 21, SQLite + Flyway          (Maven wrapper, no global Maven needed)
frontend/   Nuxt 4 SPA (Khmer UI), built to static files
desktop/    Electron shell: starts/stops the backend, serves the UI over app://school, installer
scripts/    build, measurement and test helpers
spikes/     throw-away proofs (S2) kept as evidence
docs/       architecture, progress, performance log
```

## Everyday commands (PowerShell, repo root)
| Task | Command |
|---|---|
| Backend tests | `npm run backend:test` |
| Build backend jar | `npm run backend:build`, then `node scripts/extract-backend.mjs` |
| Backend smoke test (lifecycle) | `npm run smoke:backend` |
| Run backend for UI work | `node scripts/dev-backend.mjs --fresh` |
| UI tests / type-check / build | `npm run test -w frontend` · `npm run typecheck -w frontend` · `npm run generate -w frontend` |
| Desktop type-check / bundle | `npm run typecheck -w desktop` · `npm run build -w desktop` |
| Shell end-to-end test (Electron + backend) | `node desktop/test/e2e-shell.mjs` |
| Minimal JRE for the installer | `node scripts/build-jre.mjs` |
| Installer | `node desktop/scripts/package.mjs nsis` (or `dir` for an unpacked app) |
| Packaged-app test / installer test | `node desktop/test/e2e-packaged.mjs` · `powershell -File scripts/test-installer.ps1` |
| Start-up / memory measurement | `node scripts/measure-app.mjs` · `node scripts/measure-startup.mjs` |

## Environment notes for this PC
- JDK 21 is found via `JAVA_HOME` or `C:\Users\<you>\.jdks\corretto-21.0.6` (no system change needed).
- If a shell has `ELECTRON_RUN_AS_NODE=1` (VS Code's terminal does) Electron starts as plain Node and shows no window — the test scripts clear it; clear it yourself before `electron .`.
- npm 11 blocks dependency install scripts by default; Electron's binary is fetched with `node node_modules/electron/install.js`.
- User data lives in `%LOCALAPPDATA%\RuralSchoolManagement` (never in the install folder). Developer runs use `.dev-data/` (git-ignored) or `SMS_DATA_DIR`.
