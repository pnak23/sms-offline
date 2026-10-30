import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { jvmArgs, type AppConfig } from './config';
import { log } from './log';
import type { Paths } from './paths';

const execFileAsync = promisify(execFile);

export type BackendState = 'starting' | 'ready' | 'failed' | 'stopped';
export interface BackendStatus { state: BackendState; code?: string }

const START_TIMEOUT_MS = 90_000;
const SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Owns the Spring Boot child process (docs §4.2–4.4). The launch secret and data dir travel in the ENVIRONMENT (argv is
 * visible in the process list); stdin stays a pipe so the backend exits by itself if this process dies.
 */
export class BackendManager extends EventEmitter {
  private child: ChildProcess | null = null;
  private stopping = false;
  state: BackendState = 'stopped';
  failureCode?: string;
  port = 0;
  secret = '';
  private readonly external = process.env.SMS_EXTERNAL_BACKEND;
  /** Reused on restart so the page's Content-Security-Policy (which names the backend origin) stays valid. */
  private preferredPort = 0;

  constructor(private readonly paths: Paths, private readonly config: () => AppConfig) { super(); }

  baseUrl(): string { return this.external ?? `http://127.0.0.1:${this.port}`; }
  pid(): number | undefined { return this.child?.pid; }
  status(): BackendStatus { return { state: this.state, code: this.failureCode }; }

  private set(state: BackendState, code?: string): void {
    this.state = state;
    this.failureCode = code;
    this.emit('status', this.status());
  }

  async start(): Promise<void> {
    if (this.state === 'starting' || this.state === 'ready') return;
    const wanted = this.preferredPort;
    await this.startOnce(this.config().backend.port > 0 ? this.config().backend.port : wanted);
    if (this.state === 'failed' && wanted > 0 && this.config().backend.port === 0) {
      log.warn(`could not reuse port ${wanted}, retrying on a free port`);
      this.preferredPort = 0;
      await this.startOnce(0);
      if ((this.state as BackendState) === 'ready') this.emit('portChanged', this.port);   // cast: TypeScript cannot see startOnce() changed it
    }
  }

  private async startOnce(port: number): Promise<void> {
    this.set('starting');
    this.stopping = false;

    if (this.external) {                                   // developer mode: backend runs from the IDE
      this.secret = process.env.SMS_EXTERNAL_SECRET ?? '';
      this.port = Number(new URL(this.external).port);
      log.info(`using external backend ${this.external}`);
      this.set('ready');
      return;
    }
    if (!existsSync(this.paths.javaExe) || !existsSync(this.paths.backendJar)) {
      log.error(`backend files missing: java=${existsSync(this.paths.javaExe)} jar=${existsSync(this.paths.backendJar)}`);
      this.set('failed', 'JAVA_MISSING');
      return;
    }
    await this.killStale();

    this.secret = randomBytes(32).toString('hex');
    const cfg = this.config();
    const args = [...jvmArgs(cfg), '-jar', this.paths.backendJar];
    if (port > 0) args.push(`--server.port=${port}`);
    const env: NodeJS.ProcessEnv = { ...process.env, SMS_DATA_DIR: this.paths.dataDir, SMS_LAUNCH_SECRET: this.secret, SMS_PARENT_STDIN: '1' };
    delete env.ELECTRON_RUN_AS_NODE;   // a developer shell may set it; it would turn java's launcher env into Node mode elsewhere

    const t0 = Date.now();
    const child = spawn(this.paths.javaExe, args, { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.child = child;
    if (child.pid) writeFileSync(path.join(this.paths.configDir, 'backend.pid'), String(child.pid), 'utf8');
    log.info(`backend spawned pid=${child.pid}`);

    const stderrTail: string[] = [];
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (d: string) => { for (const l of d.split(/\r?\n/)) if (l) { stderrTail.push(l); if (stderrTail.length > 40) stderrTail.shift(); } });

    const outcome = await new Promise<{ ok: true; port: number } | { ok: false; code: string }>((resolve) => {
      let buf = '';
      let done = false;
      const finish = (r: { ok: true; port: number } | { ok: false; code: string }) => { if (!done) { done = true; clearTimeout(timer); resolve(r); } };
      const timer = setTimeout(() => finish({ ok: false, code: 'TIMEOUT' }), START_TIMEOUT_MS);
      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (d: string) => {
        buf += d;
        let i: number;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (line.startsWith('SMS_READY ')) finish({ ok: true, port: JSON.parse(line.slice(10)).port });
          else if (line.startsWith('SMS_STARTUP_FAILED ')) finish({ ok: false, code: JSON.parse(line.slice(19)).code });
        }
      });
      child.once('exit', (code) => finish({ ok: false, code: 'BACKEND_EXITED' + (code != null ? `_${code}` : '') }));
    });

    if (!outcome.ok) {
      log.error(`backend failed to start: ${outcome.code} after ${Date.now() - t0} ms; stderr tail: ${stderrTail.slice(-8).join(' | ')}`);
      await this.kill();
      this.set('failed', outcome.code.startsWith('BACKEND_EXITED') ? 'BACKEND_EXITED' : outcome.code);
      return;
    }
    this.port = outcome.port;
    if (!(await this.probe())) {
      log.error('backend printed READY but /internal/health did not answer');
      await this.kill();
      this.set('failed', 'HEALTH_PROBE_FAILED');
      return;
    }
    log.info(`backend ready on 127.0.0.1:${this.port} in ${Date.now() - t0} ms`);
    child.once('exit', (code) => {
      if (this.stopping) return;
      log.error(`backend exited unexpectedly (code ${code})`);
      this.child = null;
      this.set('failed', 'BACKEND_EXITED');
    });
    this.set('ready');
  }

  /** GET /internal/health with the launch secret. */
  async probe(): Promise<boolean> {
    for (let i = 0; i < 5; i++) {
      try {
        const r = await fetch(`${this.baseUrl()}/internal/health`, { headers: { 'X-SMS-Launch-Secret': this.secret }, signal: AbortSignal.timeout(3000) });
        if (r.ok) return true;
      } catch { /* retry */ }
      await new Promise((r) => setTimeout(r, 300));
    }
    return false;
  }

  /** Windows has no SIGTERM: ask nicely through the shutdown endpoint (closes the pool -> WAL checkpoint), then force. */
  async stop(): Promise<void> {
    this.stopping = true;
    const child = this.child;
    if (this.external || !child || child.exitCode !== null) { this.child = null; this.set('stopped'); return; }
    const exited = new Promise<void>((r) => child.once('exit', () => r()));
    try {
      await fetch(`${this.baseUrl()}/internal/shutdown`, { method: 'POST', headers: { 'X-SMS-Launch-Secret': this.secret }, signal: AbortSignal.timeout(2000) });
    } catch { /* fall through to the timeout / kill */ }
    const graceful = await Promise.race([exited.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), SHUTDOWN_TIMEOUT_MS))]);
    if (!graceful) { log.warn('backend did not exit in time, force-killing its process tree'); await this.kill(); }
    log.info(`backend stopped (${graceful ? 'graceful' : 'forced'})`);
    this.child = null;
    try { rmSync(path.join(this.paths.configDir, 'backend.pid'), { force: true }); } catch { /* ignore */ }
    this.set('stopped');
  }

  async restart(): Promise<void> {
    this.preferredPort = this.port;
    await this.stop();
    await this.start();
  }

  private async kill(): Promise<void> {
    const pid = this.child?.pid;
    if (!pid) return;
    try { await execFileAsync('taskkill', ['/PID', String(pid), '/T', '/F']); } catch { /* already gone */ }
  }

  /** A previous run that died without the stdin watchdog firing: kill it only if it really is our backend. */
  private async killStale(): Promise<void> {
    const pidFile = path.join(this.paths.configDir, 'backend.pid');
    if (!existsSync(pidFile)) return;
    const pid = Number(readFileSync(pidFile, 'utf8').trim());
    try {
      if (Number.isInteger(pid) && pid > 0) {
        const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
          `(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}' -ErrorAction SilentlyContinue).CommandLine`], { windowsHide: true });
        if (stdout.includes('sms-backend.jar')) {
          log.warn(`killing stale backend pid=${pid}`);
          await execFileAsync('taskkill', ['/PID', String(pid), '/T', '/F']);
        }
      }
    } catch (e) { log.warn(`stale backend check failed: ${(e as Error).message}`); }
    rmSync(pidFile, { force: true });
  }

  /** Working-set memory (MB) of the backend process, via tasklist; used by the health page. */
  async memoryMb(): Promise<number> {
    const pid = this.child?.pid;
    if (!pid) return 0;
    try {
      const { stdout } = await execFileAsync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { windowsHide: true });
      const m = /"([\d.,\s]+)\s*K"\s*$/m.exec(stdout.trim());
      return m?.[1] ? Math.round(Number(m[1].replace(/[^\d]/g, '')) / 1024) : 0;
    } catch { return 0; }
  }
}
