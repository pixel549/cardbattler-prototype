const PREFIX_RARITY = {
  C: "starter",
  NC: "common",
  UC: "uncommon",
  R: "rare",
  P: "special",
};

const RARITY_DEFAULTS = {
  starter: { rewardWeight: 0, shopPrice: 0 },
  common: { rewardWeight: 1, shopPrice: 55 },
  uncommon: { rewardWeight: 0.46, shopPrice: 80 },
  rare: { rewardWeight: 0.2, shopPrice: 120 },
  special: { rewardWeight: 0, shopPrice: 0 },
};

const CARD_OVERRIDES = {
  "NC-027": { rarity: "uncommon", rewardWeight: 0.52, shopPrice: 80 },
  "NC-033": { rarity: "uncommon", rewardWeight: 0.38, shopPrice: 75 },
  "NC-034": { rarity: "uncommon", rewardWeight: 0.42, shopPrice: 80 },
  "NC-039": { rarity: "uncommon", rewardWeight: 0.34, shopPrice: 85 },
  "NC-061": { rarity: "rare", rewardWeight: 0.18, shopPrice: 125 },
  "NC-065": { rarity: "uncommon", rewardWeight: 0.34, shopPrice: 90 },
  "NC-072": { rarity: "rare", rewardWeight: 0.16, shopPrice: 120 },
  "NC-078": { rarity: "uncommon", rewardWeight: 0.4, shopPrice: 85 },
  "NC-080": { rarity: "uncommon", rewardWeight: 0.34, shopPrice: 90 },
  "NC-084": { rarity: "uncommon", rewardWeight: 0.34, shopPrice: 90 },
  "NC-096": { rarity: "uncommon", rewardWeight: 0.4, shopPrice: 80 },
  "NC-097": { rarity: "uncommon", rewardWeight: 0.4, shopPrice: 80 },
  "UC-007": { rarity: "rare", rewardWeight: 0.18, shopPrice: 120 },
};

function getCardPrefix(cardId) {
  return String(cardId || "").split("-")[0] || "";
}

function getRawText(effect) {
  if (effect?.op !== "RawText" || !effect?.text) return "";
  return String(effect.text);
}

function countRawTextDraw(effect) {
  const text = getRawText(effect);
  if (!text) return 0;
  let total = 0;
  const matches = text.match(/Draw (\d+)/gi) || [];
  for (const match of matches) {
    const amount = parseInt(match.replace(/[^\d]/g, ""), 10);
    if (Number.isFinite(amount)) total += amount;
  }
  return total;
}

function countExplicitDraw(effect) {
  if (effect?.op !== "DrawCards") return 0;
  return Number(effect.amount || 0);
}

export function getCardDrawAmount(card) {
  return (card?.effects || []).reduce((total, effect) => {
    return total + countExplicitDraw(effect) + countRawTextDraw(effect);
  }, 0);
}

export function isDrawCentricCard(card) {
  const tags = card?.tags || [];
  if (tags.includes("Draw")) return true;
  if (tags.includes("Power") && tags.includes("Setup")) return false;
  if (getCardDrawAmount(card) > 0) return true;
  return (card?.effects || []).some((effect) => /draw/i.test(getRawText(effect)));
}

export function getCardBalanceMeta(cardId, card) {
  const prefix = getCardPrefix(cardId);
  const defaults = RARITY_DEFAULTS[PREFIX_RARITY[prefix] || "common"];
  const override = CARD_OVERRIDES[cardId] || {};
  const rarity = override.rarity || PREFIX_RARITY[prefix] || "common";
  const base = RARITY_DEFAULTS[rarity] || defaults;
  const drawAmount = getCardDrawAmount(card);
  const drawCentric = isDrawCentricCard(card);

  return {
    rarity,
    rewardWeight: Number(override.rewardWeight ?? base.rewardWeight ?? defaults.rewardWeight ?? 1),
    shopPrice: Number(override.shopPrice ?? base.shopPrice ?? defaults.shopPrice ?? 55),
    drawCentric,
    drawAmount,
    starterEligible: rarity === "common" && !drawCentric && !card?.tags?.includes("Power"),
    rewardEligible: rarity !== "starter" && rarity !== "special" && !card?.tags?.includes("EnemyCard"),
    shopEligible: rarity !== "starter" && rarity !== "special" && !card?.tags?.includes("EnemyCard"),
  };
}
