// The release metadata and the places that must agree with it. One authoritative file, release/release.json; everything else is derived.
// Used by scripts/version.mjs (set / sync / check) and by desktop/test/version.test.mjs (which runs it against a copy of the tree).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/;
export const IDENTITY_FIELDS = ['name', 'shortName', 'developer', 'version', 'channel', 'copyright'];
export const DEVELOPMENT_STATES = ['COMPLETED', 'IN_PROGRESS'];
export const PENDING_STATES = ['CONFIGURATION', 'OFFICIAL_INFORMATION', 'PHYSICAL_TESTING'];
export const GROUPS = ['information', 'hardware'];

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const detectEol = (text) => (text.includes('\r\n') ? '\r\n' : '\n');

export function readRelease(root) {
  return readJson(path.join(root, 'release', 'release.json'));
}

/** Problems with release.json itself (empty field, not a semantic version). */
export function validateRelease(release) {
  const problems = [];
  for (const f of IDENTITY_FIELDS) if (typeof release[f] !== 'string' || release[f].trim() === '') problems.push(`release.json: "${f}" is missing or empty`);
  if (typeof release.version === 'string' && !SEMVER.test(release.version)) problems.push(`release.json: version "${release.version}" is not a semantic version (MAJOR.MINOR.PATCH)`);
  return problems;
}

/**
 * Problems with the acceptance registry. It may only hold the four states a developer can claim: whether the work is done, and what is
 * still pending. "Final school acceptance completed" is a human sign-off kept in the database and must never appear in this file.
 */
export function validateAcceptance(acceptance) {
  const problems = [];
  if (acceptance.format !== 1) problems.push('acceptance.json: format must be 1');
  if (!Array.isArray(acceptance.items) || acceptance.items.length === 0) return [...problems, 'acceptance.json: items is missing or empty'];
  const seen = new Set();
  for (const item of acceptance.items) {
    const label = `acceptance.json item "${item?.id}"`;
    if (typeof item?.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(item.id)) problems.push(`${label}: id must be lower-case words joined by hyphens`);
    else if (seen.has(item.id)) problems.push(`${label}: duplicate id`);
    else seen.add(item.id);
    if (!GROUPS.includes(item?.group)) problems.push(`${label}: group must be one of ${GROUPS.join(', ')}`);
    if (!DEVELOPMENT_STATES.includes(item?.development)) problems.push(`${label}: development must be one of ${DEVELOPMENT_STATES.join(', ')}`);
    if (!PENDING_STATES.includes(item?.pending)) problems.push(`${label}: pending must be one of ${PENDING_STATES.join(', ')} (final acceptance is recorded in the database, never here)`);
    const extra = Object.keys(item ?? {}).filter((k) => !['id', 'group', 'development', 'pending'].includes(k));
    if (extra.length) problems.push(`${label}: unexpected field(s) ${extra.join(', ')}`);
  }
  if (/final|accepted/i.test(JSON.stringify(acceptance.items))) problems.push('acceptance.json: an item mentions final acceptance; that state is recorded in the database only');
  return problems;
}

/** Every place that holds a literal copy of something in release.json, with how to read and rewrite it. */
function targets(root) {
  const p = (...parts) => path.join(root, ...parts);
  const jsonField = (file, field, expected) => ({
    file, field, expected,
    read: (text) => JSON.parse(text)[field],
    write: (text) => {
      const re = new RegExp(`("${field}"\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*"`);
      if (!re.test(text)) throw new Error(`${file}: no "${field}" field to update`);
      return text.replace(re, (_, head) => `${head}${JSON.stringify(expected)}`);
    },
  });
  return (release) => [
    jsonField(p('package.json'), 'version', release.version),
    jsonField(p('desktop', 'package.json'), 'version', release.version),
    jsonField(p('desktop', 'package.json'), 'author', release.developer),
    jsonField(p('desktop', 'package.json'), 'description', release.name),
    jsonField(p('frontend', 'package.json'), 'version', release.version),
    {
      file: p('backend', 'pom.xml'), field: 'project version', expected: release.version,
      read: (text) => /<artifactId>sms-backend<\/artifactId>\s*<version>([^<]+)<\/version>/.exec(text)?.[1],
      write: (text) => {
        const re = /(<artifactId>sms-backend<\/artifactId>\s*<version>)[^<]+(<\/version>)/;
        if (!re.test(text)) throw new Error('backend/pom.xml: the project version was not found');
        return text.replace(re, `$1${release.version}$2`);
      },
    },
  ];
}

/** The lock file records the workspaces' versions too; npm would rewrite them on the next install, so they are kept in step here. */
function lockProblems(root, release) {
  const file = path.join(root, 'package-lock.json');
  if (!existsSync(file)) return { file, wrong: [] };
  const lock = readJson(file);
  const wrong = [];
  if (lock.version !== release.version) wrong.push('version');
  for (const key of ['', 'desktop', 'frontend']) if (lock.packages?.[key] && lock.packages[key].version !== release.version) wrong.push(`packages["${key}"].version`);
  return { file, wrong };
}

/** Compares everything with release.json. Returns a list of human-readable problems (empty = consistent). */
export function check(root) {
  const release = readRelease(root);
  const problems = validateRelease(release);
  const acceptanceFile = path.join(root, 'release', 'acceptance.json');
  problems.push(...(existsSync(acceptanceFile) ? validateAcceptance(readJson(acceptanceFile)) : ['release/acceptance.json is missing']));
  if (problems.some((x) => x.startsWith('release.json'))) return problems;
  for (const t of targets(root)(release)) {
    const actual = t.read(readFileSync(t.file, 'utf8'));
    if (actual !== t.expected) problems.push(`${path.relative(root, t.file)}: ${t.field} is "${actual}", release.json says "${t.expected}"`);
  }
  const lock = lockProblems(root, release);
  for (const w of lock.wrong) problems.push(`package-lock.json: ${w} differs from release.json (run: node scripts/version.mjs sync)`);
  return problems;
}

/** Writes release.json's values into every derived file. Returns the files that changed. */
export function sync(root) {
  const release = readRelease(root);
  const bad = validateRelease(release);
  if (bad.length) throw new Error(bad.join('\n'));
  const changed = new Set();
  const byFile = new Map();
  for (const t of targets(root)(release)) byFile.set(t.file, [...(byFile.get(t.file) ?? []), t]);
  for (const [file, list] of byFile) {
    const original = readFileSync(file, 'utf8');
    let text = original;
    for (const t of list) text = t.write(text);
    if (text !== original) { writeFileSync(file, text, 'utf8'); changed.add(file); }
  }
  const lockFile = path.join(root, 'package-lock.json');
  if (existsSync(lockFile)) {
    const original = readFileSync(lockFile, 'utf8');
    const lock = JSON.parse(original);
    lock.version = release.version;
    for (const key of ['', 'desktop', 'frontend']) if (lock.packages?.[key]) lock.packages[key].version = release.version;
    const text = JSON.stringify(lock, null, 2) + (original.endsWith('\n') ? detectEol(original) : '');
    const normalised = detectEol(original) === '\r\n' ? text.replace(/\r?\n/g, '\r\n') : text;
    if (normalised !== original) { writeFileSync(lockFile, normalised, 'utf8'); changed.add(lockFile); }
  }
  return [...changed].map((f) => path.relative(root, f));
}

/** Changes the version in release.json (the only place a person edits it) and syncs the rest. */
export function setVersion(root, version) {
  if (!SEMVER.test(version)) throw new Error(`"${version}" is not a semantic version (MAJOR.MINOR.PATCH, e.g. 1.1.0)`);
  const file = path.join(root, 'release', 'release.json');
  const original = readFileSync(file, 'utf8');
  const text = original.replace(/("version"\s*:\s*)"[^"]*"/, `$1"${version}"`);
  writeFileSync(file, text, 'utf8');
  return ['release/release.json', ...sync(root)];
}
