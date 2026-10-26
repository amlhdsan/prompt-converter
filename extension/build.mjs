// Builds the Chrome MV3 extension from the shared core into dist-ext/ and zips it.
// Usage: node extension/build.mjs [--zip]
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, 'dist-ext');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });

const shim = { name: 'platform-shim', setup(b) { b.onResolve({ filter: /\/platform$/ }, (a) => (a.importer.includes(`${path.sep}src${path.sep}`) && !a.importer.includes('extension') ? { path: path.join(root, 'extension/src/shim-platform.ts') } : undefined)); } };
const common = { bundle: true, minify: true, target: 'chrome110', plugins: [shim], define: { __APP_VERSION__: JSON.stringify(pkg.version), __APP_COMMIT__: '""' }, logLevel: 'warning' };
await build({ ...common, entryPoints: [path.join(root, 'extension/src/background.ts')], outfile: path.join(out, 'background.js'), format: 'esm' });
await build({ ...common, entryPoints: [path.join(root, 'extension/src/content.ts')], outfile: path.join(out, 'content.js'), format: 'iife' });
await build({ ...common, entryPoints: [path.join(root, 'extension/src/popup.ts')], outfile: path.join(out, 'popup.js'), format: 'iife' });

cpSync(path.join(root, 'extension/static/popup.html'), path.join(out, 'popup.html'));
for (const s of ['192', '512']) cpSync(path.join(root, `public/icons/icon-${s}.png`), path.join(out, `icon-${s}.png`));
const man = JSON.parse(readFileSync(path.join(root, 'extension/static/manifest.json'), 'utf8'));
man.version = pkg.version;
writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(man, null, 2));
if (process.argv.includes('--zip')) {
  const zip = path.join(root, `prompt-converter-extension-${pkg.version}.zip`);
  rmSync(zip, { force: true });
  execSync(`cd "${out}" && python3 -m zipfile -c "${zip}" *`);
  console.log('extension zip:', zip);
}
console.log('extension built:', out);
