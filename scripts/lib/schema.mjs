// The schema version a database must have: the highest V<n>__*.sql in backend/src/main/resources/db/migration.
// Tests compare against this instead of a literal, so adding a migration does not break them.
import { readdirSync } from 'node:fs';
import path from 'node:path';

const dir = path.resolve(import.meta.dirname, '..', '..', 'backend', 'src', 'main', 'resources', 'db', 'migration');

export function latestSchemaVersion() {
  const versions = readdirSync(dir).map((f) => /^V(\d+)__.*\.sql$/.exec(f)?.[1]).filter(Boolean).map(Number);
  if (versions.length === 0) throw new Error(`no migrations found in ${dir}`);
  return String(Math.max(...versions));
}
