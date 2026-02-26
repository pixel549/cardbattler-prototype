export function makeSave(state) {
  return { version: 1, createdAtISO: new Date().toISOString(), state };
}
export function loadSave(raw) {
  const parsed = JSON.parse(raw);
  if (!parsed || parsed.version !== 1) throw new Error("Unsupported save version");
  return parsed;
}
export function stringifySave(save) {
  return JSON.stringify(save);
}
