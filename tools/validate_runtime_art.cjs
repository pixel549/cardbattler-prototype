const fs = require('node:fs');
const path = require('node:path');

const rootDir = process.cwd();
const cardsDir = path.join(rootDir, 'src', 'assets', 'runtime-art', 'cards');
const enemiesDir = path.join(rootDir, 'src', 'assets', 'runtime-art', 'enemies');
const eventsDir = path.join(rootDir, 'src', 'assets', 'runtime-art', 'events');
const enemyImagesSourcePath = path.join(rootDir, 'src', 'data', 'enemyImages.js');
const eventImagesSourcePath = path.join(rootDir, 'src', 'data', 'eventImages.js');

function ensureDir(dirPath, label) {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`${label} directory is missing: ${dirPath}`);
  }
}

function listFiles(dirPath, pattern) {
  return fs.readdirSync(dirPath).filter((file) => pattern.test(file));
}

function swapExtension(filename, nextExtension) {
  return filename.replace(/\.(png|jpe?g)$/i, `.${nextExtension}`);
}

function fileExistsInSet(fileSet, filename) {
  if (fileSet.has(filename)) return true;
  const lower = filename.toLowerCase();
  if (fileSet.has(lower)) return true;
  const candidates = [
    swapExtension(filename, 'png'),
    swapExtension(filename, 'jpg'),
    swapExtension(filename, 'jpeg'),
  ];
  return candidates.some((candidate) => fileSet.has(candidate) || fileSet.has(candidate.toLowerCase()));
}

function readMatches(filePath, pattern) {
  const source = fs.readFileSync(filePath, 'utf8');
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

function validateCardArt() {
  ensureDir(cardsDir, 'Card art');
  const files = listFiles(cardsDir, /\.png$/i);
  if (files.length < 150) {
    throw new Error(`Card art looks incomplete. Expected at least 150 PNGs, found ${files.length}.`);
  }

  const variantsById = new Map();
  for (const file of files) {
    const match = file.match(/^([A-Z]+-\d+)-(\d+)\.png$/i);
    if (!match) continue;
    const [, cardId, variant] = match;
    if (!variantsById.has(cardId)) variantsById.set(cardId, new Set());
    variantsById.get(cardId).add(variant);
  }

  if (variantsById.size < 75) {
    throw new Error(`Card art set looks too small. Expected at least 75 card IDs, found ${variantsById.size}.`);
  }

  const missingVariants = [];
  for (const [cardId, variants] of variantsById.entries()) {
    if (!variants.has('01') || !variants.has('02')) {
      missingVariants.push(cardId);
    }
  }

  if (missingVariants.length) {
    throw new Error(`Card art is missing required variants for: ${missingVariants.slice(0, 12).join(', ')}`);
  }

  return {
    cardFiles: files.length,
    cardIds: variantsById.size,
  };
}

function validateEnemyArt() {
  ensureDir(enemiesDir, 'Enemy art');
  const files = listFiles(enemiesDir, /\.(png|jpe?g)$/i);
  if (files.length < 250) {
    throw new Error(`Enemy art looks incomplete. Expected at least 250 images, found ${files.length}.`);
  }

  const fileSet = new Set(files);
  const mappedFilenames = [...new Set(readMatches(enemyImagesSourcePath, /:\s*'([^']+\.(?:png|jpe?g))'/gi))];
  const missing = mappedFilenames.filter((filename) => !fileExistsInSet(fileSet, filename));

  if (missing.length) {
    throw new Error(`Enemy art mapping references missing files: ${missing.slice(0, 12).join(', ')}`);
  }

  return {
    enemyFiles: files.length,
    enemyMapped: mappedFilenames.length,
  };
}

function validateEventArt() {
  ensureDir(eventsDir, 'Event art');
  const files = listFiles(eventsDir, /\.(png|jpe?g)$/i);
  if (files.length < 15) {
    throw new Error(`Event art looks incomplete. Expected at least 15 images, found ${files.length}.`);
  }

  const fileSet = new Set(files);
  const referencedFilenames = [...new Set(readMatches(eventImagesSourcePath, /I\['([^']+\.(?:png|jpe?g))'\]/gi))];
  const missing = referencedFilenames.filter((filename) => !fileSet.has(filename));

  if (missing.length) {
    throw new Error(`Event art mapping references missing files: ${missing.slice(0, 12).join(', ')}`);
  }

  return {
    eventFiles: files.length,
    eventReferenced: referencedFilenames.length,
  };
}

try {
  const cardSummary = validateCardArt();
  const enemySummary = validateEnemyArt();
  const eventSummary = validateEventArt();

  console.log(
    [
      'Runtime art check passed.',
      `${cardSummary.cardIds} card IDs / ${cardSummary.cardFiles} card files`,
      `${enemySummary.enemyMapped} enemy mappings / ${enemySummary.enemyFiles} enemy files`,
      `${eventSummary.eventReferenced} event references / ${eventSummary.eventFiles} event files`,
    ].join(' ')
  );
} catch (error) {
  console.error(`Runtime art validation failed: ${error.message}`);
  process.exit(1);
}
