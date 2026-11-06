// Tests for the release metadata tooling (scripts/lib/version.mjs, docs/RELEASE.md): the repository itself must be consistent, drift must be
// caught and fixed, and the shipped acceptance list must be unable to claim that the school accepted anything.
// Run: node --test desktop/test/version.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { check, readRelease, SEMVER, setVersion, sync, validateAcceptance, validateRelease } from '../../scripts/lib/version.mjs';

const repo = path.resolve(import.meta.dirname, '..', '..');
const work = mkdtempSync(path.join(tmpdir(), 'sms version '));

/** A small copy of the tree: the files the tooling reads and writes. */
function tree() {
  const root = mkdtempSync(path.join(work, 't-'));
  for (const f of ['package.json', 'package-lock.json', 'release/release.json', 'release/acceptance.json', 'desktop/package.json', 'frontend/package.json', 'backend/pom.xml']) {
    mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    cpSync(path.join(repo, f), path.join(root, f));
  }
  return root;
}
const read = (root, f) => readFileSync(path.join(root, f), 'utf8');
const readJson = (root, f) => JSON.parse(read(root, f));

test('the repository itself is consistent: every copy of the version and the identity agrees with release/release.json', () => {
  assert.deepEqual(check(repo), []);
  const r = readRelease(repo);
  assert.match(r.version, SEMVER);
  assert.equal(readJson(repo, 'desktop/package.json').version, r.version);
  assert.equal(readJson(repo, 'frontend/package.json').version, r.version);
  assert.equal(readJson(repo, 'package.json').version, r.version);
  assert.equal(readJson(repo, 'desktop/package.json').author, r.developer);
});

test('a copy that drifts is reported by name, and sync repairs exactly that', () => {
  const root = tree();
  const desktop = path.join(root, 'desktop/package.json');
  writeFileSync(desktop, read(root, 'desktop/package.json').replace(/"version": "[^"]+"/, '"version": "9.9.9"'));
  const pom = path.join(root, 'backend/pom.xml');
  writeFileSync(pom, read(root, 'backend/pom.xml').replace(/(<artifactId>sms-backend<\/artifactId>\s*<version>)[^<]+/, '$18.8.8'));
  const problems = check(root);
  assert.equal(problems.length, 2, problems.join(' | '));
  assert.ok(problems.some((p) => p.includes('desktop') && p.includes('9.9.9')));
  assert.ok(problems.some((p) => p.includes('pom.xml') && p.includes('8.8.8')));
  const changed = sync(root);
  assert.equal(changed.length, 2);
  assert.deepEqual(check(root), []);
});

test('set changes the version in release.json and carries it to package.json x3, the lock file and pom.xml, and nowhere it should not', () => {
  const root = tree();
  const before = read(root, 'release/release.json');
  const changed = setVersion(root, '1.1.0');
  assert.ok(changed.includes('release/release.json') && changed.some((f) => f.endsWith('pom.xml')) && changed.some((f) => f.endsWith('package-lock.json')));
  assert.equal(readRelease(root).version, '1.1.0');
  assert.equal(readJson(root, 'desktop/package.json').version, '1.1.0');
  assert.equal(readJson(root, 'frontend/package.json').version, '1.1.0');
  assert.equal(readJson(root, 'package-lock.json').packages[''].version, '1.1.0');
  assert.equal(readJson(root, 'package-lock.json').packages.desktop.version, '1.1.0');
  assert.match(read(root, 'backend/pom.xml'), /<artifactId>sms-backend<\/artifactId>\s*<version>1\.1\.0<\/version>/);
  assert.match(read(root, 'backend/pom.xml'), /<parent>[\s\S]*<version>4\.1\.2<\/version>[\s\S]*<\/parent>/, 'the Spring Boot parent version is not touched');
  assert.equal(read(root, 'release/release.json').replace('1.1.0', '1.0.0'), before, 'only the version changed in release.json');
  assert.deepEqual(check(root), []);
  assert.equal(sync(root).length, 0, 'a second sync has nothing to do');
});

test('only a semantic version is accepted', () => {
  const root = tree();
  for (const bad of ['1.0', 'v1.0.0', '1.0.0.0', '01.0.0', '1.0.x', '', 'latest', '1.0.0 ']) {
    assert.equal(SEMVER.test(bad), false, JSON.stringify(bad));
    assert.throws(() => setVersion(root, bad), /semantic version/, JSON.stringify(bad));
  }
  for (const good of ['0.1.0', '1.0.0', '1.1.1', '2.0.0', '10.20.30', '1.0.0-rc.1', '1.0.0-beta']) assert.equal(SEMVER.test(good), true, good);
  assert.equal(readRelease(root).version, '1.0.0', 'a refused version changes nothing');
  assert.deepEqual(validateRelease({ ...readRelease(repo), version: '1.0' }).length, 1);
  assert.deepEqual(validateRelease({ ...readRelease(repo), shortName: ' ' }).length, 1);
});

test('line endings of the files that sync rewrites are kept (a Windows checkout stays CRLF)', () => {
  const root = tree();
  const pom = path.join(root, 'backend/pom.xml');
  writeFileSync(pom, read(root, 'backend/pom.xml').replace(/\r?\n/g, '\r\n'));
  setVersion(root, '2.0.0');
  const after = read(root, 'backend/pom.xml');
  assert.ok(after.includes('\r\n') && !/[^\r]\n/.test(after), 'still CRLF everywhere');
  assert.match(after, /<version>2\.0\.0<\/version>/);
});

test('the acceptance list can only claim "built" and "still pending": it can never say the school accepted something', () => {
  const ok = readJson(repo, 'release/acceptance.json');
  assert.deepEqual(validateAcceptance(ok), []);
  assert.equal(ok.items.length, 13);
  const item = (over) => ({ ...ok, items: [{ ...ok.items[0], ...over }, ...ok.items.slice(1)] });
  assert.ok(validateAcceptance(item({ pending: 'FINAL_ACCEPTANCE_COMPLETED' })).some((p) => /final acceptance is recorded in the database/.test(p)));
  assert.ok(validateAcceptance(item({ development: 'DONE' })).length > 0);
  assert.ok(validateAcceptance(item({ group: 'other' })).length > 0);
  assert.ok(validateAcceptance(item({ id: ok.items[1].id })).some((p) => /duplicate id/.test(p)));
  assert.ok(validateAcceptance(item({ signedOff: true })).some((p) => /unexpected field/.test(p)), 'no sneaking a sign-off in as an extra field');
  assert.ok(validateAcceptance({ ...ok, items: [] }).length > 0);
  assert.ok(validateAcceptance(item({ id: 'Bad Id' })).length > 0);
  // and the check run by every build fails on it
  const root = tree();
  const file = path.join(root, 'release/acceptance.json');
  writeFileSync(file, readFileSync(file, 'utf8').replace('"OFFICIAL_INFORMATION"', '"FINAL_ACCEPTANCE_COMPLETED"'));
  assert.ok(check(root).some((p) => p.includes('acceptance.json')));
});

test.after(() => rmSync(work, { recursive: true, force: true }));
