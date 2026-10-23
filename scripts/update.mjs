#!/usr/bin/env node
// Cross-platform updater: git pull + npm install (+ build). Usage: npm run update
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const run = (cmd) => execSync(cmd, { stdio: 'inherit', shell: true });
const ver = () => JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const before = ver();
try {
  console.log('→ git pull'); run('git pull --ff-only');
  console.log('→ npm install'); run('npm install');
  console.log('→ npm run build'); run('npm run build');
  const after = ver();
  console.log(after === before ? `\n✓ Already up to date (v${after}).` : `\n✓ Updated v${before} → v${after}. See CHANGELOG.md.`);
  console.log('  Restart `npm run dev` / `npm run preview` if running. Docker: docker compose up -d --build');
} catch {
  console.error('\n✗ Update failed. Resolve the error above (e.g. local changes: git stash) and retry.');
  process.exit(1);
}
