// Guards the Khmer text: every string the UI asks for exists, and every code the BACKEND can send has Khmer wording.
// The backend scan reads ../backend/src/main/java (the code is the contract); it is skipped when that folder is absent.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const FRONTEND = path.resolve(__dirname, '..');
const BACKEND = path.resolve(FRONTEND, '..', 'backend', 'src', 'main', 'java');
const km = JSON.parse(readFileSync(path.join(FRONTEND, 'i18n', 'locales', 'km.json'), 'utf8')) as Record<string, unknown>;
const icons = JSON.parse(readFileSync(path.join(FRONTEND, 'app', 'config', 'icons.json'), 'utf8')) as string[];

function walk(dir: string, extensions: string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return walk(full, extensions);
    return extensions.some((ext) => name.endsWith(ext)) ? [full] : [];
  });
}

const lookup = (key: string): unknown => key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], km);
const has = (key: string) => typeof lookup(key) === 'string';

function leaves(node: unknown, prefix = ''): [string, unknown][] {
  if (node && typeof node === 'object') return Object.entries(node).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
  return [[prefix, node]];
}

const appFiles = walk(path.join(FRONTEND, 'app'), ['.vue', '.ts']);
const appSource = appFiles.map((f) => readFileSync(f, 'utf8'));

describe('km.json', () => {
  it('has only non-empty strings', () => {
    const bad = leaves(km).filter(([, v]) => typeof v !== 'string' || v.trim() === '');
    expect(bad).toEqual([]);
  });

  it('uses only valid vue-i18n syntax: named placeholders {name}, no stray @ | $ or braces', () => {
    const problems: string[] = [];
    for (const [key, value] of leaves(km)) {
      const text = String(value);
      if (/[@|$]/.test(text)) problems.push(`${key}: contains @, | or $`);
      const withoutPlaceholders = text.replace(/\{[A-Za-z][A-Za-z0-9]*\}/g, '');
      if (/[{}]/.test(withoutPlaceholders)) problems.push(`${key}: stray brace`);
    }
    expect(problems).toEqual([]);
  });

  it('has every key the UI asks for with t("...") / te("...") and in the nav config', () => {
    const missing = new Set<string>();
    for (const source of appSource) {
      for (const m of source.matchAll(/\b(?:t|te)\(\s*'([A-Za-z0-9_.]+)'/g)) if (!has(m[1]!)) missing.add(m[1]!);
      for (const m of source.matchAll(/(?:labelKey|titleKey|hintKey):\s*'([A-Za-z0-9_.]+)'/g)) if (!has(m[1]!)) missing.add(m[1]!);
    }
    expect([...missing]).toEqual([]);
  });

  it('covers the dynamic key families (steps, notices, strengths, statuses)', () => {
    const wanted = [
      ...[1, 2, 3, 4, 5, 6, 7].flatMap((n) => [`setup.steps.${n}`, `setup.titles.${n}`]),
      ...['SESSION_EXPIRED', 'SIGNED_OUT', 'PASSWORD_CHANGED'].map((c) => `auth.notice.${c}`),
      ...['weak', 'fair', 'good'].map((c) => `auth.strength.${c}`),
      ...['OK', 'INFO', 'WARN', 'FAIL'].flatMap((s) => [`dashboard.healthChip.${s}`, `health.status.${s}`, `health.overall.${s}`]),
    ];
    expect(wanted.filter((k) => !has(k))).toEqual([]);
  });

  it('has Khmer text where Khmer text is expected (no English placeholders slipped in)', () => {
    const khmer = /[ក-៿]/;
    const technicalOnly = new Set(['validation.INVALID_FILE_TYPE']);
    const english = leaves(km).filter(([key, value]) => !khmer.test(String(value)) && !technicalOnly.has(key));
    expect(english).toEqual([]);
  });
});

describe.skipIf(!existsSync(BACKEND))('every backend code has Khmer wording', () => {
  const javaFiles = existsSync(BACKEND) ? walk(BACKEND, ['.java']) : [];
  const java = javaFiles.map((f) => ({ file: path.basename(f), text: readFileSync(f, 'utf8') }));

  it('error codes (ApiException, ApiErrors, filters) -> error.<CODE>', () => {
    const codes = new Set<string>();
    for (const { text } of java) {
      for (const m of text.matchAll(/new ApiException\(\s*HttpStatus\.[A-Z_]+,\s*"([A-Z][A-Z0-9_]+)"/g)) codes.add(m[1]!);
      for (const m of text.matchAll(/problem\(\s*HttpStatus\.[A-Z_]+,\s*"([A-Z][A-Z0-9_]+)"/g)) codes.add(m[1]!);
      for (const m of text.matchAll(/\\"code\\":\\"([A-Z][A-Z0-9_]+)\\"/g)) codes.add(m[1]!);
      for (const m of text.matchAll(/case [A-Z_]+ -> "([A-Z][A-Z0-9_]+)"/g)) codes.add(m[1]!); // SqliteConstraints mapping
      for (const m of text.matchAll(/default -> "([A-Z][A-Z0-9_]+)"/g)) codes.add(m[1]!);
    }
    codes.add('VALIDATION_FAILED');
    expect(codes.size).toBeGreaterThan(10); // the scan itself works
    const missing = [...codes].filter((code) => !has(`error.${code}`)).sort();
    expect(missing).toEqual([]);
  });

  it('field codes (ApiException.validation / FieldError / bean validation) -> validation.<CODE>', () => {
    const codes = new Set<string>();
    for (const { text } of java) {
      for (const m of text.matchAll(/validation\(\s*"[A-Za-z.]+",\s*"([A-Z][A-Z0-9_]+)"/g)) codes.add(m[1]!);
      for (const m of text.matchAll(/FieldError\(\s*[^,]+,\s*"([A-Z][A-Z0-9_]+)"/g)) codes.add(m[1]!);
      for (const m of text.matchAll(/@(NotBlank|NotNull|NotEmpty|Size|Min|Max|Past|PastOrPresent|Future|FutureOrPresent|Pattern|Email|Positive|PositiveOrZero|Digits)\b/g)) codes.add(m[1]!);
    }
    expect(codes.size).toBeGreaterThan(5);
    const missing = [...codes].filter((code) => !has(`validation.${code}`)).sort();
    expect(missing).toEqual([]);
  });

  it('health checks: a title per check id and a sentence per (check, code)', () => {
    const service = java.find((j) => j.file === 'HealthService.java')!.text;
    const methodOf = new Map<string, string>(); // check id -> method name
    for (const m of service.matchAll(/run\(\s*\w+,\s*"([A-Z_]+)",\s*this::(\w+)\)/g)) methodOf.set(m[1]!, m[2]!);
    expect(methodOf.size).toBeGreaterThanOrEqual(13);

    const missing: string[] = [];
    for (const [id, method] of methodOf) {
      if (!has(`health.checks.${id}.title`)) missing.push(`${id}.title`);
      const start = service.indexOf(`private Result ${method}(`);
      const end = service.indexOf('\n    private ', start + 1);
      const body = service.slice(start, end === -1 ? undefined : end);
      const codes = new Set<string>([...body.matchAll(/Result\.of\(\s*(?:"[A-Z]+"|\w+ \? "[A-Z]+" : "[A-Z]+"),\s*"([A-Z_]+)"/g)].map((m) => m[1]!));
      if (/Result\.ok\(/.test(body)) codes.add('OK');
      expect(codes.size, `no codes found for ${id}`).toBeGreaterThan(0);
      for (const code of codes) if (!has(`health.checks.${id}.${code}`) && !has(`health.codes.${code}`)) missing.push(`${id}.${code}`);
    }
    expect(missing).toEqual([]);
    expect(has('health.codes.CHECK_ERROR')).toBe(true); // run() reports CHECK_ERROR for any check that throws
  });
});

describe('client-side health checks and icons', () => {
  it('has wording for the checks only the UI can make (FONTS, PRINTERS)', () => {
    for (const key of ['FONTS.title', 'FONTS.OK', 'FONTS.NOT_BUNDLED', 'PRINTERS.title', 'PRINTERS.COUNT', 'PRINTERS.NONE', 'PRINTERS.UNAVAILABLE']) {
      expect(has(`health.checks.${key}`), key).toBe(true);
    }
  });

  it('every icon name used in the UI is in config/icons.json (the offline subset), and none is unused', () => {
    const used = new Set<string>();
    for (const source of appSource) {
      for (const m of source.matchAll(/<AppIcon[^>]*?\sname="([a-z0-9-]+)"/g)) used.add(m[1]!);
      for (const m of source.matchAll(/<LoadingButton[^>]*?\sicon="([a-z0-9-]+)"/g)) used.add(m[1]!);
      for (const m of source.matchAll(/\bicon:\s*'([a-z0-9-]+)'/g)) used.add(m[1]!);
      for (const m of source.matchAll(/<AppIcon[^>]*?:name="[^"]*"/g)) for (const q of m[0].matchAll(/'([a-z0-9-]+)'/g)) used.add(q[1]!);
    }
    const health = readFileSync(path.join(FRONTEND, 'app', 'utils', 'health.ts'), 'utf8');
    for (const m of health.matchAll(/return '([a-z0-9-]+-fill)'/g)) used.add(m[1]!);
    expect([...used].filter((name) => !icons.includes(name)).sort()).toEqual([]);

    const mentioned = (name: string) => appSource.some((s) => s.includes(`'${name}'`) || s.includes(`"${name}"`));
    expect(icons.filter((name) => !mentioned(name))).toEqual([]);
  });
});
