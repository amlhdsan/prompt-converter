// In-app update check against GitHub. Throttled (once per 24h, cached in localStorage) and silent on failure.
import { pfetch } from './platform';
export const APP_VERSION = __APP_VERSION__;
export const APP_COMMIT = __APP_COMMIT__;
export const REPO = 'amlhdsan/prompt-converter';
export const REPO_URL = `https://github.com/${REPO}`;
const CACHE_KEY = 'pc.update.v1';
const TTL = 24 * 60 * 60 * 1000;

export interface UpdateInfo {
  available: boolean;
  kind: 'release' | 'commit' | 'none';
  latest: string;      // version tag (e.g. 1.2.0) or short commit sha
  url: string;         // release / changelog / compare link
  checkedAt: number;
}

/** API base can be overridden (tests / mirrors) via localStorage key `pc.updateApi`. */
const apiBase = () => localStorage.getItem('pc.updateApi') || 'https://api.github.com';

/** Returns >0 if a is newer than b (simple semver, ignores pre-release tags). */
export function cmpVersion(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x) || 0);
  const pb = b.replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

async function getJSON(path: string): Promise<any | null> {
  const r = await pfetch(apiBase() + path, { headers: { Accept: 'application/vnd.github+json' } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export function cachedUpdate(): UpdateInfo | null {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; }
}

/** Check for updates. `force` bypasses the 24h throttle. Throws only when forced (so the UI can report it). */
export async function checkForUpdate(force = false): Promise<UpdateInfo | null> {
  const cached = cachedUpdate();
  if (!force && cached && Date.now() - cached.checkedAt < TTL) return cached;
  try {
    let info: UpdateInfo = { available: false, kind: 'none', latest: APP_VERSION, url: `${REPO_URL}/releases`, checkedAt: Date.now() };
    const rel = await getJSON(`/repos/${REPO}/releases/latest`);
    if (rel?.tag_name) {
      const v = String(rel.tag_name).replace(/^v/, '');
      info = { ...info, kind: 'release', latest: v, url: rel.html_url || `${REPO_URL}/releases`, available: cmpVersion(v, APP_VERSION) > 0 };
    } else {
      // No releases yet: compare the latest commit on main with the commit this build was made from.
      const c = await getJSON(`/repos/${REPO}/commits/main`);
      if (c?.sha && APP_COMMIT && c.sha !== APP_COMMIT) {
        info = { ...info, kind: 'commit', latest: c.sha.slice(0, 7), url: `${REPO_URL}/compare/${APP_COMMIT.slice(0, 7)}...main`, available: true };
      }
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(info));
    return info;
  } catch (e) {
    if (force) throw e;
    return null; // offline / rate-limited: fail silently
  }
}
