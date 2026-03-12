import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("global styles disable text selection and touch callouts across the UI", () => {
  const css = fs.readFileSync(new URL("../src/index.css", import.meta.url), "utf8");

  assert.match(css, /-webkit-touch-callout:\s*none;/);
  assert.match(css, /-webkit-user-select:\s*none;/);
  assert.match(css, /user-select:\s*none;/);
  assert.match(css, /::selection\s*\{[\s\S]*background-color:\s*transparent;/);
});
