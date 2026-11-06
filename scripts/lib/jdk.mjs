// Finds the JDK the same way scripts/run-mvn.mjs does, so no script needs a machine-specific path.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export function javaExe() {
  const exe = process.platform === 'win32' ? 'java.exe' : 'java';
  const home = [process.env.JAVA_HOME, path.join(homedir(), '.jdks', 'corretto-21.0.6')]
    .filter(Boolean).find((c) => existsSync(path.join(c, 'bin', exe)));
  if (!home) throw new Error('No JDK 21 found. Set JAVA_HOME (e.g. C:\\Users\\<you>\\.jdks\\corretto-21.0.6).');
  return path.join(home, 'bin', exe);
}
