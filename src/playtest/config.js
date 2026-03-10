export const PLAYTEST_MODE_STORAGE_KEY = 'cardbattler.playtestMode';
export const PLAYTEST_UPLOAD_ENDPOINT = '/__playtest/upload';

export function readPlaytestModeEnabled() {
  if (typeof window === 'undefined') return false;
  if (window.__launchParams?.playtest === '1') return true;
  try {
    return window.localStorage.getItem(PLAYTEST_MODE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writePlaytestModeEnabled(enabled) {
  if (typeof window === 'undefined') return;
  try {
    if (enabled) window.localStorage.setItem(PLAYTEST_MODE_STORAGE_KEY, 'true');
    else window.localStorage.removeItem(PLAYTEST_MODE_STORAGE_KEY);
  } catch {
    // Ignore storage failures on restricted browsers.
  }
}

export function buildPlaytestUrl(href, enabled = true) {
  if (!href) return '';
  try {
    const url = new URL(href, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    if (enabled) url.searchParams.set('playtest', '1');
    else url.searchParams.delete('playtest');
    return url.toString();
  } catch {
    return href;
  }
}

export function createPlaytestSessionId(prefix = 'phone') {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${stamp}-${suffix}`;
}
