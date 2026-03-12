import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  DEFAULT_PIPELINE_PATH,
  loadFeaturePipeline,
  validateFeaturePipeline,
} = require("../tools/check_feature_pipeline.cjs");

test("feature pipeline manifest validates cleanly", () => {
  const { data } = loadFeaturePipeline(DEFAULT_PIPELINE_PATH);
  const report = validateFeaturePipeline(data);

  assert.deepEqual(report.errors, []);
  assert.ok(report.summary.featureCount >= 4);
  assert.ok(report.summary.touchpointCount >= 8);
});

test("live features cannot keep planned retrofit work", () => {
  const fixture = {
    version: 1,
    touchpoints: [
      { id: "tutorials", label: "Tutorials" },
      { id: "tests", label: "Tests" },
    ],
    features: [
      {
        id: "fixture-feature",
        title: "Fixture Feature",
        status: "live",
        summary: "A test fixture.",
        files: ["README.md"],
        touchpoints: {
          tutorials: { status: "planned", notes: "Still needs work." },
          tests: { status: "done", notes: "Covered." },
        },
      },
    ],
  };

  const report = validateFeaturePipeline(fixture);
  assert.ok(report.errors.some((error) => /still has unfinished touchpoints/i.test(error)));
});
