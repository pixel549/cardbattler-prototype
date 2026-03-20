const SETTLED_STATUSES = new Set(['loaded', 'error', 'timeout', 'skipped']);

const runtimeArtStatusCache = new Map();
const runtimeArtPromiseCache = new Map();

function normalizeUrls(urls) {
  return [...new Set((Array.isArray(urls) ? urls : []).filter((url) => typeof url === 'string' && url.trim()))];
}

function markRuntimeArtStatus(url, status) {
  if (typeof url === 'string' && url) {
    runtimeArtStatusCache.set(url, status);
  }
  return status;
}

function waitForImageDecode(img) {
  if (!img || typeof img.decode !== 'function') return Promise.resolve();
  return img.decode().catch(() => {});
}

function preloadRuntimeArtUrl(url, { timeoutMs = 4500 } = {}) {
  if (!url) return Promise.resolve(markRuntimeArtStatus(url, 'skipped'));
  if (typeof Image === 'undefined') return Promise.resolve(markRuntimeArtStatus(url, 'skipped'));

  const cachedStatus = runtimeArtStatusCache.get(url);
  if (SETTLED_STATUSES.has(cachedStatus)) {
    return Promise.resolve(cachedStatus);
  }

  const inFlight = runtimeArtPromiseCache.get(url);
  if (inFlight) return inFlight;

  const promise = new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    let decodeQueued = false;
    let timeoutId = null;

    const finish = (status) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      runtimeArtPromiseCache.delete(url);
      resolve(markRuntimeArtStatus(url, status));
    };

    const markLoaded = () => {
      if (decodeQueued || settled) return;
      decodeQueued = true;
      waitForImageDecode(img).finally(() => finish('loaded'));
    };

    img.onload = markLoaded;
    img.onerror = () => finish('error');

    try {
      img.decoding = 'async';
    } catch {
      // Ignore browser environments that do not expose decoding on Image.
    }

    try {
      if ('fetchPriority' in img) img.fetchPriority = 'high';
    } catch {
      // Ignore browsers without fetchPriority support.
    }

    timeoutId = setTimeout(() => finish('timeout'), Math.max(500, timeoutMs));
    try {
      img.loading = 'eager';
    } catch {
      // Ignore browser environments that do not expose loading on Image.
    }
    img.src = url;

    if (img.complete && img.naturalWidth > 0) {
      markLoaded();
    }
  });

  runtimeArtPromiseCache.set(url, promise);
  return promise;
}

export function getPendingRuntimeArtUrls(urls) {
  return normalizeUrls(urls).filter((url) => !SETTLED_STATUSES.has(runtimeArtStatusCache.get(url)));
}

export function areRuntimeArtUrlsSettled(urls) {
  return getPendingRuntimeArtUrls(urls).length === 0;
}

export function preloadRuntimeArtUrls(urls, options = {}) {
  const uniqueUrls = normalizeUrls(urls);
  if (!uniqueUrls.length) return Promise.resolve([]);
  return Promise.all(uniqueUrls.map((url) => preloadRuntimeArtUrl(url, options)));
}

export function __resetRuntimeArtPreloadCacheForTests() {
  runtimeArtStatusCache.clear();
  runtimeArtPromiseCache.clear();
}
