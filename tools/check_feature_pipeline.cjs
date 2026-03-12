const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_PIPELINE_PATH = path.resolve(__dirname, "..", "docs", "feature-pipeline.json");
const REPO_ROOT = path.resolve(__dirname, "..");
const FEATURE_STATUSES = new Set(["active", "live", "deprecated"]);
const TOUCHPOINT_STATUSES = new Set(["done", "planned", "blocked", "n/a"]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadFeaturePipeline(filePath = DEFAULT_PIPELINE_PATH) {
  const resolved = path.resolve(filePath);
  return {
    filePath: resolved,
    data: readJson(resolved),
  };
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeFiles(value) {
  return toArray(value).filter((entry) => typeof entry === "string" && entry.trim().length > 0);
}

function validateFeaturePipeline(pipeline, { repoRoot = REPO_ROOT } = {}) {
  const errors = [];
  const warnings = [];
  const pending = [];

  const touchpoints = toArray(pipeline?.touchpoints);
  const features = toArray(pipeline?.features);

  if (!Number.isInteger(pipeline?.version) || pipeline.version < 1) {
    errors.push("Pipeline version must be a positive integer.");
  }

  if (touchpoints.length === 0) {
    errors.push("Pipeline must define at least one touchpoint.");
  }

  const touchpointIds = [];
  const seenTouchpointIds = new Set();
  for (const touchpoint of touchpoints) {
    if (!touchpoint || typeof touchpoint !== "object") {
      errors.push("Each touchpoint must be an object.");
      continue;
    }

    const id = String(touchpoint.id || "").trim();
    if (!id) {
      errors.push("Each touchpoint requires an id.");
      continue;
    }
    if (seenTouchpointIds.has(id)) {
      errors.push(`Duplicate touchpoint id "${id}".`);
      continue;
    }
    seenTouchpointIds.add(id);
    touchpointIds.push(id);

    if (!String(touchpoint.label || "").trim()) {
      errors.push(`Touchpoint "${id}" requires a label.`);
    }
  }

  if (features.length === 0) {
    errors.push("Pipeline must define at least one feature entry.");
  }

  const seenFeatureIds = new Set();
  for (const feature of features) {
    if (!feature || typeof feature !== "object") {
      errors.push("Each feature entry must be an object.");
      continue;
    }

    const id = String(feature.id || "").trim();
    const title = String(feature.title || "").trim();
    const status = String(feature.status || "").trim();
    const summary = String(feature.summary || "").trim();
    const featureFiles = normalizeFiles(feature.files);
    const touchpointStates = feature.touchpoints && typeof feature.touchpoints === "object"
      ? feature.touchpoints
      : null;

    if (!id) {
      errors.push("Each feature requires an id.");
      continue;
    }
    if (seenFeatureIds.has(id)) {
      errors.push(`Duplicate feature id "${id}".`);
      continue;
    }
    seenFeatureIds.add(id);

    if (!title) errors.push(`Feature "${id}" requires a title.`);
    if (!summary) errors.push(`Feature "${id}" requires a summary.`);
    if (!FEATURE_STATUSES.has(status)) {
      errors.push(`Feature "${id}" has invalid status "${status}".`);
    }

    if (featureFiles.length === 0) {
      errors.push(`Feature "${id}" must list at least one linked file.`);
    }

    for (const relativeFile of featureFiles) {
      const resolved = path.resolve(repoRoot, relativeFile);
      if (!fs.existsSync(resolved)) {
        errors.push(`Feature "${id}" references missing file "${relativeFile}".`);
      }
    }

    if (!touchpointStates) {
      errors.push(`Feature "${id}" requires a touchpoints object.`);
      continue;
    }

    const missingTouchpoints = touchpointIds.filter((touchpointId) => !(touchpointId in touchpointStates));
    if (missingTouchpoints.length > 0) {
      errors.push(`Feature "${id}" is missing touchpoints: ${missingTouchpoints.join(", ")}.`);
    }

    const extraTouchpoints = Object.keys(touchpointStates).filter((touchpointId) => !seenTouchpointIds.has(touchpointId));
    if (extraTouchpoints.length > 0) {
      errors.push(`Feature "${id}" has unknown touchpoints: ${extraTouchpoints.join(", ")}.`);
    }

    const pendingIds = [];
    for (const touchpointId of touchpointIds) {
      const state = touchpointStates[touchpointId];
      if (!state || typeof state !== "object") continue;
      const touchpointStatus = String(state.status || "").trim();
      if (!TOUCHPOINT_STATUSES.has(touchpointStatus)) {
        errors.push(`Feature "${id}" touchpoint "${touchpointId}" has invalid status "${touchpointStatus}".`);
        continue;
      }
      if (!String(state.notes || "").trim()) {
        errors.push(`Feature "${id}" touchpoint "${touchpointId}" requires notes.`);
      }
      if (touchpointStatus === "planned" || touchpointStatus === "blocked") {
        pendingIds.push(touchpointId);
      }
    }

    if (status === "live" && pendingIds.length > 0) {
      errors.push(`Live feature "${id}" still has unfinished touchpoints: ${pendingIds.join(", ")}.`);
    } else if (pendingIds.length > 0) {
      pending.push({ id, title, pendingIds });
    }
  }

  if (errors.length === 0 && pending.length > 0) {
    warnings.push(`${pending.length} feature(s) still have retrofit follow-ups.`);
  }

  return {
    errors,
    warnings,
    pending,
    summary: {
      featureCount: features.length,
      touchpointCount: touchpoints.length,
      liveCount: features.filter((feature) => feature?.status === "live").length,
      activeCount: features.filter((feature) => feature?.status === "active").length,
    },
  };
}

function formatPending(pending = []) {
  if (!pending.length) return "";
  return pending
    .map((entry) => `  - ${entry.id}: ${entry.pendingIds.join(", ")}`)
    .join("\n");
}

function runValidation(filePath = DEFAULT_PIPELINE_PATH) {
  const { filePath: resolvedPath, data } = loadFeaturePipeline(filePath);
  const report = validateFeaturePipeline(data, { repoRoot: REPO_ROOT });

  if (report.errors.length > 0) {
    console.error(`[feature-pipeline] FAILED ${path.relative(REPO_ROOT, resolvedPath)}`);
    for (const error of report.errors) {
      console.error(`  - ${error}`);
    }
    return { ok: false, report };
  }

  console.log(
    `[feature-pipeline] OK ${report.summary.featureCount} features, `
      + `${report.summary.touchpointCount} touchpoints, `
      + `${report.summary.liveCount} live, `
      + `${report.summary.activeCount} active`,
  );

  if (report.pending.length > 0) {
    console.log("[feature-pipeline] Pending retrofit follow-ups:");
    console.log(formatPending(report.pending));
  }

  return { ok: true, report };
}

function main() {
  const filePath = process.argv[2] || DEFAULT_PIPELINE_PATH;
  const { ok } = runValidation(filePath);
  if (!ok) process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_PIPELINE_PATH,
  FEATURE_STATUSES,
  TOUCHPOINT_STATUSES,
  loadFeaturePipeline,
  runValidation,
  validateFeaturePipeline,
};
