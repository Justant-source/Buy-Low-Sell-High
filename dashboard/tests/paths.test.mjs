import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { publicRoot } from "../dist/lib/paths.js";

test("dist server resolves bundled static assets", () => {
  const expectedRoot = path.resolve(import.meta.dirname, "../dist/public");
  assert.equal(path.normalize(publicRoot), expectedRoot);
  assert.equal(existsSync(path.join(publicRoot, "backtests.html")), true);
  assert.equal(existsSync(path.join(publicRoot, "js", "backtests-dashboard.js")), true);
});
