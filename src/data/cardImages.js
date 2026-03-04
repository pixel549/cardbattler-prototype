/**
 * Card artwork lookup — Action Cards folder.
 * Files are named <CARD_ID>-01.png and <CARD_ID>-02.png (two variants per card).
 */
const modules = import.meta.glob(
  '/Concept_art/Action Cards/*.png',
  { eager: true, as: 'url' }
);

// Build map: cardId -> url (use variant -01 as primary)
const cardImageMap = {};
for (const [path, url] of Object.entries(modules)) {
  const m = path.match(/\/([A-Z]+-\d+)-(\d+)\.png$/i);
  if (!m) continue;
  const [, id, variant] = m;
  if (!cardImageMap[id]) cardImageMap[id] = [];
  cardImageMap[id][parseInt(variant) - 1] = url;
}

/**
 * Returns the artwork URL for a card def ID (e.g. "C-001", "NC-005").
 * Returns null if no image is available.
 */
export function getCardImage(cardId) {
  if (!cardId) return null;
  const imgs = cardImageMap[cardId];
  return imgs?.[0] ?? null;
}
