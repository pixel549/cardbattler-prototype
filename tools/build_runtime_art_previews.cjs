'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const rootDir = process.cwd();
const sourceRoot = path.join(rootDir, 'src', 'assets', 'runtime-art');
const previewRoot = path.join(rootDir, 'src', 'generated', 'runtime-art-previews');

const PREVIEW_PROFILES = {
  cards: { width: 320, height: 460, quality: 72 },
  enemies: { width: 420, height: 620, quality: 70 },
  events: { width: 900, height: 520, quality: 68 },
};

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function walkFiles(dirPath, matcher) {
  if (!fs.existsSync(dirPath)) return [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath, matcher));
      continue;
    }
    if (matcher.test(entry.name)) results.push(fullPath);
  }
  return results;
}

function toPosixRelative(filePath, baseDir) {
  return path.relative(baseDir, filePath).split(path.sep).join('/');
}

function changeExtension(filePath, extension) {
  return filePath.replace(/\.(png|jpe?g)$/i, extension);
}

function getPreviewProfile(relativeSourcePath) {
  const category = relativeSourcePath.split('/')[0];
  return PREVIEW_PROFILES[category] || null;
}

async function buildPreview(sourcePath) {
  const relativeSourcePath = toPosixRelative(sourcePath, sourceRoot);
  const profile = getPreviewProfile(relativeSourcePath);
  if (!profile) return null;

  const previewRelativePath = changeExtension(relativeSourcePath, '.webp');
  const previewPath = path.join(previewRoot, previewRelativePath);

  ensureDir(path.dirname(previewPath));

  const sourceStat = fs.statSync(sourcePath);
  if (fs.existsSync(previewPath)) {
    const previewStat = fs.statSync(previewPath);
    if (previewStat.mtimeMs >= sourceStat.mtimeMs && previewStat.size > 0) {
      return { sourceStat, previewStat, skipped: true };
    }
  }

  const pipeline = sharp(sourcePath, { failOn: 'none' }).rotate();
  await pipeline
    .resize({
      width: profile.width,
      height: profile.height,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({
      quality: profile.quality,
      effort: 4,
    })
    .toFile(previewPath);

  return {
    sourceStat,
    previewStat: fs.statSync(previewPath),
    skipped: false,
  };
}

function removeStalePreviews(validPreviewRelativePaths) {
  const previewFiles = walkFiles(previewRoot, /\.webp$/i);
  let removed = 0;
  for (const previewPath of previewFiles) {
    const relativePreviewPath = toPosixRelative(previewPath, previewRoot);
    if (validPreviewRelativePaths.has(relativePreviewPath)) continue;
    fs.unlinkSync(previewPath);
    removed += 1;
  }
  return removed;
}

async function main() {
  ensureDir(previewRoot);

  const sourceFiles = walkFiles(sourceRoot, /\.(png|jpe?g)$/i).sort();
  const validPreviewRelativePaths = new Set(
    sourceFiles.map((sourcePath) => changeExtension(toPosixRelative(sourcePath, sourceRoot), '.webp'))
  );

  let built = 0;
  let skipped = 0;
  let totalSourceBytes = 0;
  let totalPreviewBytes = 0;

  for (const sourcePath of sourceFiles) {
    const result = await buildPreview(sourcePath);
    if (!result) continue;
    totalSourceBytes += result.sourceStat.size;
    totalPreviewBytes += result.previewStat.size;
    if (result.skipped) skipped += 1;
    else built += 1;
  }

  const removed = removeStalePreviews(validPreviewRelativePaths);

  console.log(
    [
      '[art-previews] OK',
      `${sourceFiles.length} source files`,
      `${built} built`,
      `${skipped} reused`,
      removed ? `${removed} stale removed` : '0 stale removed',
      `${(totalPreviewBytes / 1024 / 1024).toFixed(1)} MB previews from ${(totalSourceBytes / 1024 / 1024).toFixed(1)} MB source`,
    ].join(' | ')
  );
}

main().catch((error) => {
  console.error(`[art-previews] Failed: ${error.message}`);
  process.exit(1);
});
