const previewModules = import.meta.glob(
  '/src/generated/runtime-art-previews/**/*.{webp,png,jpg,jpeg}',
  { eager: true, import: 'default' }
);

const previewByAssetKey = new Map();

function getAssetKeyFromPath(input) {
  if (typeof input !== 'string' || !input.trim()) return null;

  const cleaned = input.split('?')[0].split('#')[0];
  const segments = cleaned.split('/');
  const filename = segments[segments.length - 1] || '';
  const stem = filename.replace(/\.[^.]+$/, '');
  if (!stem) return null;

  if (previewByAssetKey.has(stem)) return stem;

  const unHashedStem = stem.replace(/-[A-Za-z0-9]{6,}$/, '');
  return previewByAssetKey.has(unHashedStem) ? unHashedStem : stem;
}

for (const [modulePath, imported] of Object.entries(previewModules)) {
  const url = typeof imported === 'string' ? imported : imported?.default ?? null;
  if (!url) continue;

  const assetKey = getAssetKeyFromPath(modulePath);
  if (!assetKey) continue;

  previewByAssetKey.set(assetKey, url);
}

export function getRuntimeArtPreviewUrl(src) {
  const assetKey = getAssetKeyFromPath(src);
  return assetKey ? previewByAssetKey.get(assetKey) ?? null : null;
}

export function getRuntimeArtPreviewUrls(urls = []) {
  const unique = [];
  const seen = new Set();

  for (const url of Array.isArray(urls) ? urls : []) {
    if (typeof url !== 'string' || !url.trim()) continue;
    const previewUrl = getRuntimeArtPreviewUrl(url) || url;
    if (seen.has(previewUrl)) continue;
    seen.add(previewUrl);
    unique.push(previewUrl);
  }

  return unique;
}
