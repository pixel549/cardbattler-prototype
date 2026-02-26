import { assertGameData, buildPools } from "./data";

export function loadGameDataFromJson(raw) {
  const data = buildPools(structuredClone(raw));
  assertGameData(data);
  return data;
}
