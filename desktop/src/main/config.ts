import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { totalmem } from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { log } from './log';

/**
 * config/app.json (docs §4C.3). Everything here is validated before use: a hand-edited file can never inject
 * arbitrary JVM arguments. Unknown keys are ignored; invalid values fall back to the safe defaults.
 */
const ALLOWED_EXTRA_ARGS: RegExp[] = [
  /^-XX:MaxMetaspaceSize=\d{2,4}m$/,
  /^-XX:ReservedCodeCacheSize=\d{2,3}m$/,
  /^-XX:TieredStopAtLevel=[0-4]$/,
  /^-XX:CICompilerCount=\d$/,
  /^-Dsms\.startup-trace=(true|false)$/,
];

const ConfigSchema = z.object({
  backend: z.object({
    port: z.number().int().min(0).max(65535).default(0),
    jvm: z.object({
      maxHeapMb: z.number().int().optional(),
      initialHeapMb: z.number().int().optional(),
      extraArgs: z.array(z.string()).default([]),
    }).default({ extraArgs: [] }),
  }).default({ port: 0, jvm: { extraArgs: [] } }),
  desktop: z.object({ disableGpu: z.boolean().default(false) }).default({ disableGpu: false }),
});
export type AppConfig = z.infer<typeof ConfigSchema>;

const MIB = 1024 * 1024;

/** Default heap by installed RAM (docs §4C.3): <= ~4 GB -> 256 MB, 6-8 GB -> 384 MB, >= ~12 GB -> 512 MB. */
export function defaultMaxHeapMb(totalBytes = totalmem()): number {
  const gb = totalBytes / (1024 * MIB);
  if (gb < 5) return 256;
  if (gb < 11) return 384;
  return 512;
}

export function loadConfig(configDir: string): AppConfig {
  const file = path.join(configDir, 'app.json');
  let raw: unknown = {};
  if (existsSync(file)) {
    try { raw = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { log.warn(`app.json is not valid JSON, using defaults (${(e as Error).message})`); }
  } else {
    try { writeFileSync(file, JSON.stringify({ backend: { port: 0, jvm: { extraArgs: [] } }, desktop: { disableGpu: false } }, null, 2) + '\n', 'utf8'); } catch { /* read-only is fine */ }
  }
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    log.warn('app.json has invalid values, using defaults: ' + parsed.error.issues.map((i) => i.path.join('.')).join(', '));
    return ConfigSchema.parse({});
  }
  return parsed.data;
}

/** Final JVM options: tiered defaults, validated overrides, only allow-listed extras. */
export function jvmArgs(cfg: AppConfig, totalBytes = totalmem()): string[] {
  const ramMb = Math.floor(totalBytes / MIB);
  const ceiling = Math.min(2048, Math.floor(ramMb / 2));
  const requested = cfg.backend.jvm.maxHeapMb ?? defaultMaxHeapMb(totalBytes);
  const maxHeap = Math.max(192, Math.min(requested, ceiling));
  const initialRaw = cfg.backend.jvm.initialHeapMb ?? 64;
  const initial = Math.max(32, Math.min(initialRaw, maxHeap));
  if (maxHeap !== requested) log.warn(`maxHeapMb ${requested} adjusted to ${maxHeap} (bounds 192..${ceiling})`);

  const extra: string[] = [];
  for (const a of cfg.backend.jvm.extraArgs) {
    if (ALLOWED_EXTRA_ARGS.some((re) => re.test(a))) extra.push(a); else log.warn(`ignored JVM argument not on the allow-list: ${a}`);
  }
  return [
    `-Xms${initial}m`, `-Xmx${maxHeap}m`,
    '-XX:MaxMetaspaceSize=160m', '-XX:ReservedCodeCacheSize=64m', '-Xss512k',
    '-XX:+UseSerialGC', '-XX:TieredStopAtLevel=1',           // C1 only: measured 52 % faster cold start (docs/PERF-LOG.md)
    '-XX:+ExitOnOutOfMemoryError',                             // exit cleanly; no heap dumps (they would contain student data)
    '-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8',
    ...extra,
  ];
}
