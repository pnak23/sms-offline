// Version management (docs/RELEASE.md). The authoritative file is release/release.json; this keeps every other copy in step.
//   node scripts/version.mjs check          fails (exit 1) if any file disagrees with release.json, or release.json / acceptance.json are malformed
//   node scripts/version.mjs sync           writes release.json's values into package.json (x3), package-lock.json and backend/pom.xml
//   node scripts/version.mjs set 1.1.0      changes the version in release.json, then syncs
import path from 'node:path';
import { check, readRelease, setVersion, sync } from './lib/version.mjs';

const root = path.resolve(import.meta.dirname, '..');
const [command, argument] = process.argv.slice(2);

try {
  if (command === 'check') {
    const problems = check(root);
    if (problems.length) {
      console.error('Version / release metadata check FAILED:\n  - ' + problems.join('\n  - ') + '\n\nFix release/release.json, then run: node scripts/version.mjs sync');
      process.exit(1);
    }
    const r = readRelease(root);
    console.log(`release metadata is consistent: ${r.shortName} ${r.version} (${r.channel})`);
  } else if (command === 'sync') {
    const changed = sync(root);
    console.log(changed.length ? 'updated: ' + changed.join(', ') : 'already consistent');
  } else if (command === 'set' && argument) {
    console.log('updated: ' + setVersion(root, argument).join(', '));
  } else {
    console.error('usage: node scripts/version.mjs check | sync | set <MAJOR.MINOR.PATCH>');
    process.exit(2);
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
