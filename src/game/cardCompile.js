function normalizeCompileCardType(card) {
  const rawType = String(card?.type || "").toLowerCase();
  if (rawType.includes("attack")) return "Attack";
  if (rawType.includes("defense")) return "Defense";
  if (rawType.includes("support")) return "Support";
  if (rawType.includes("power")) return "Power";
  return "Utility";
}

export function getCompileBonus(card) {
  const type = normalizeCompileCardType(card);
  switch (type) {
    case "Attack":
      return { type, label: "+4 backup damage", shortLabel: "+4 DMG", description: "Adds 4 backup damage when the card resolves." };
    case "Defense":
      return { type, label: "+5 Firewall", shortLabel: "+5 FW", description: "Adds 5 Firewall when the card resolves." };
    case "Support":
      return { type, label: "+4 heal", shortLabel: "+4 HP", description: "Heals 4 HP when the card resolves." };
    case "Power":
      return { type, label: "+3 Firewall on deploy", shortLabel: "+3 FW", description: "Adds 3 Firewall when the power is deployed." };
    default:
      return { type: "Utility", label: "+1 RAM", shortLabel: "+1 RAM", description: "Gains 1 RAM when the card resolves." };
  }
}

export function canCompileCard(card, instance) {
  if (!card || !instance) return false;
  return Number(instance.compileLevel || 0) < 1;
}

export function getCompilePreview(card, instance) {
  const bonus = getCompileBonus(card);
  const eligible = canCompileCard(card, instance);
  const currentCost = Math.max(0, Number(card?.costRAM || 0) + Number(instance?.ramCostDelta || 0));
  const reducedCost = Math.max(0, currentCost - 1);
  return {
    eligible,
    currentCost,
    reducedCost,
    compileLevel: Number(instance?.compileLevel || 0),
    bonus,
    summary: eligible
      ? `Compile once: cost ${currentCost} -> ${reducedCost}; ${bonus.label}.`
      : "This card has already been Compiled.",
    reason: eligible ? null : "This card has already been Compiled.",
  };
}

export function applyCompileToCardInstance(card, instance) {
  const preview = getCompilePreview(card, instance);
  if (!preview.eligible) return false;
  instance.compileLevel = 1;
  instance.ramCostDelta = Number(instance.ramCostDelta || 0) - 1;
  return true;
}
