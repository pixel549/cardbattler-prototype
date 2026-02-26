import { RNG } from "./rng";

function pickDistinct(rng, pool, n) {
  const out = [];
  const copy = [...pool];
  while (out.length < n && copy.length > 0) {
    const idx = rng.int(copy.length);
    out.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return out;
}

export function makeRelicChoices(data, seed, kind) {
  const salt = kind === "boss" ? 0xB055E5 : 0xE11E7E;
  const rng = new RNG((seed ^ salt) >>> 0);

  const pool = kind === "boss"
    ? (data.relicRewardPools?.boss || [])
    : [...(data.relicRewardPools?.uncommon || []), ...(data.relicRewardPools?.rare || [])];

  return pickDistinct(rng, pool, 3);
}
