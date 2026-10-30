// Bundles the Electron main process and the (sandboxed, therefore single-file CJS) preload scripts with esbuild,
// and copies the offline splash / error pages plus their bundled Khmer font into dist/.
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(path.join(dist, 'static', 'fonts'), { recursive: true });

const common = { bundle: true, platform: 'node', format: 'cjs', target: 'node24', sourcemap: false, logLevel: 'info', external: ['electron'] };
await build({ ...common, entryPoints: [path.join(root, 'src/main/index.ts')], outfile: path.join(dist, 'main.cjs') });
await build({ ...common, entryPoints: [path.join(root, 'src/preload/index.ts')], outfile: path.join(dist, 'preload.cjs') });
await build({ ...common, entryPoints: [path.join(root, 'src/preload/error.ts')], outfile: path.join(dist, 'preload-error.cjs') });

cpSync(path.join(root, 'src/static'), path.join(dist, 'static'), { recursive: true });
const fontDir = path.resolve(root, '..', 'node_modules', '@fontsource', 'noto-sans-khmer', 'files');
for (const w of ['400', '700']) {
  cpSync(path.join(fontDir, `noto-sans-khmer-khmer-${w}-normal.woff2`), path.join(dist, 'static', 'fonts', `noto-sans-khmer-${w}.woff2`));
}
console.log('desktop build complete ->', dist);
