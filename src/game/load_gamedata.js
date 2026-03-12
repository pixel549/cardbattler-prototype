import { assertGameData, buildPools } from "./data.js";

export function loadGameDataFromJson(raw) {
  const data = buildPools(structuredClone(raw));
  assertGameData(data);
  return data;
}
