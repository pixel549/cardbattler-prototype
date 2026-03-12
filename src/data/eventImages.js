/**
 * Event background image lookup.
 * Images are from the Cyberpunk Back-Alley Clinic Scene - Grok folder.
 *
 * Image catalog (what each depicts):
 *  image (1).png  — Rainy room, CRT monitor, couch         → default / hideout
 *  image (1).jpg  — Figure vs wall of red TV monitors       → vendor / oracle / vision
 *  image (2).png  — Mirror corridor, running figures        → ambush / chase / swarm
 *  image (3).png  — Holographic twin figures in white box   → echo / mirror / temporal
 *  image (4).png  — Man + glowing triangle logo in rain     → bargain / corporate deal
 *  image (5).png  — Man with glowing briefcase under bridge → cache / data pickup
 *  image (6).png  — Man in rain with geometric logo         → Act 3 bargain
 *  image (7).png  — Cracked green terminal, abandoned lab   → glitch / corrupt / mutation
 *  image (8).png  — Glowing container in lab               → prototype / nest / lab
 *  image (9).png  — Dark digital server corridor            → phantom / vanta / collapse
 *  image (10).png — Dark tunnel with red glow at end        → overcharge / vortex / danger
 *  image (11).png — Hooded figure with glowing briefcase    → scrap / industrial cache
 *  image (12).png — Glowing blue holographic cube           → patch / data / system upgrade
 *  image (13).png — Blue cube in dark server corridor       → rewrite / neural / minigame
 *  image (14).png — Operating table in rain, orange light   → clinic / heal / rest
 *  image (15).png — Silhouette in bright clinic doorway     → clinic variant
 */

const modules = import.meta.glob(
  '/src/assets/runtime-art/events/*.{png,jpg,jpeg}',
  { eager: true, import: 'default' }
);

const byFile = {};
for (const [path, imported] of Object.entries(modules)) {
  const url = typeof imported === 'string' ? imported : imported?.default ?? null;
  if (!url) continue;
  const fname = path.split('/').pop();
  byFile[fname] = url;
}

const I = byFile; // shorthand

// Category → image URL mapping
const CAT_MAP = {
  DEFAULT:    I['image (1).png'],
  CACHE:      I['image (5).png'],
  AMBUSH:     I['image (2).png'],
  BARGAIN:    I['image (4).png'],
  GLITCH:     I['image (7).png'],
  PATCH:      I['image (12).png'],
  VENDOR:     I['image (1).jpg'],
  ECHO:       I['image (3).png'],
  PHANTOM:    I['image (9).png'],
  NEST:       I['image (8).png'],
  LOTTERY:    I['image (10).png'],
  MIRROR:     I['image (3).png'],
  REWRITE:    I['image (13).png'],
  PROTOTYPE:  I['image (8).png'],
  OVERCHARGE: I['image (10).png'],
  VORTEX:     I['image (10).png'],
  COLLAPSE:   I['image (9).png'],
  VISION:     I['image (1).jpg'],
  SWARM:      I['image (2).png'],
  SCRAP:      I['image (11).png'],
  TIME:       I['image (3).png'],
  MUT:        I['image (7).png'],
  RESOURCE:   I['image (12).png'],
  MINIGAME:   I['image (13).png'],
  REST:       I['image (14).png'],
  SACRIFICE:  I['image (6).png'],
  TRADE:      I['image (4).png'],
  HEALTH:     I['image (14).png'],
  BRICK:      I['image (7).png'],
  VOLATILE:   I['image (10).png'],
};

// Per-event-ID overrides for special events
const ID_OVERRIDES = {
  StreetDoc:   I['image (14).png'],
  RestSite:    I['image (14).png'],
  DataCache:   I['image (5).png'],
  GlitchZone:  I['image (7).png'],
  SalvageYard: I['image (11).png'],
  BlackMarketDeal: I['image (4).png'],
  SystemRestore:   I['image (12).png'],
  CorporateSpy:    I['image (1).jpg'],
  EchoChamber:     I['image (3).png'],
  RogueDrone:      I['image (2).png'],
  ShadowBroker:    I['image (1).jpg'],
  CorpAmbush:      I['image (6).png'],
};

/**
 * Returns a background image URL for an event ID.
 * Falls back through ID override → category keyword → default.
 */
export function getEventImage(eventId) {
  if (!eventId) return CAT_MAP.DEFAULT;

  // Exact ID override
  if (ID_OVERRIDES[eventId]) return ID_OVERRIDES[eventId];

  const upper = eventId.toUpperCase();

  // Check special multi-word patterns first
  if (upper.includes('TIME_LOOP') || upper.includes('ACT_RESET')) return CAT_MAP.TIME;
  if (upper.includes('MINIGAME')) return CAT_MAP.MINIGAME;
  if (upper.includes('MUT_RAMP') || upper.includes('MUT_REMOVE') || upper.includes('MUT_POOL') || upper.includes('MUT_BAN')) return CAT_MAP.MUT;
  if (upper.includes('TRADE_RELIC')) return CAT_MAP.TRADE;
  if (upper.includes('SACRIFICE')) return CAT_MAP.SACRIFICE;
  if (upper.includes('HEALTH_HALVE')) return CAT_MAP.HEALTH;
  if (upper.includes('BRICK_GAMBLE')) return CAT_MAP.BRICK;
  if (upper.includes('RESOURCE_BOOST')) return CAT_MAP.RESOURCE;
  if (upper.includes('HP_RAM')) return CAT_MAP.TRADE;
  if (upper.includes('ALL_SCRAP')) return CAT_MAP.SCRAP;
  if (upper.includes('ALL_SWARM')) return CAT_MAP.SWARM;

  // Extract the category segment from: EVENT_ACT1_CACHE_001
  const m = upper.match(/EVENT_(?:ACT[123]_|ANY_ACT_|ALL_|MUT_)?([A-Z]+)/);
  const cat = m?.[1];
  if (cat && CAT_MAP[cat]) return CAT_MAP[cat];

  return CAT_MAP.DEFAULT;
}
