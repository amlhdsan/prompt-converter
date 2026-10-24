import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
// Build commit is used by the update checker when the repo has no releases. Empty when .git is unavailable (e.g. Docker).
let commit = process.env.APP_COMMIT ?? '';
if (!commit) { try { commit = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* no git */ } }

// Default base "./" works for localhost, Docker, any static host and Tauri.
// For GitHub Pages set BASE_PATH=/prompt-converter/.
// Stamp the service-worker cache name with the app version so each release refreshes the offline cache.
const swVersion = {
  name: 'sw-version',
  apply: 'build' as const,
  generateBundle(this: any) {
    const src = readFileSync(new URL('./public/sw.js', import.meta.url), 'utf8').replace('__VERSION__', `${pkg.version}-${commit.slice(0, 7) || Date.now()}`);
    this.emitFile({ type: 'asset', fileName: 'sw.js', source: src });
  },
};

export default defineConfig({
  plugins: [swVersion],
  build: { target: 'es2020', cssMinify: true, reportCompressedSize: true },
  base: process.env.BASE_PATH ?? './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commit),
  },
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
});
