import assert from "node:assert/strict";
import test from "node:test";

import {
  parseMaterializeSweepsCliArgs,
  resolveSweepMaterializationTargets,
} from "../dist/materialize-sweeps.js";

test("materialize sweeps CLI parser accepts csv lists and numeric overrides", () => {
  const args = parseMaterializeSweepsCliArgs([
    "--workspace",
    "soxl,tqqq",
    "--profile-id",
    "koru_default_5x30",
    "--sweep-id",
    "core4_v4",
    "--max-workers",
    "6",
    "--chunk-size",
    "12",
    "--batch-concurrency",
    "3",
    "--force",
    "--dry-run",
  ]);
  assert.deepEqual(args.workspaceIds, ["soxl", "tqqq"]);
  assert.deepEqual(args.profileIds, ["koru_default_5x30"]);
  assert.equal(args.maxWorkers, 6);
  assert.equal(args.chunkSize, 12);
  assert.equal(args.batchConcurrency, 3);
  assert.equal(args.force, true);
  assert.equal(args.dryRun, true);
});

test("materialize sweeps target resolution defaults to workspace profiles and deduplicates", () => {
  const targets = resolveSweepMaterializationTargets(
    parseMaterializeSweepsCliArgs([
      "--workspace",
      "soxl",
      "--profile-id",
      "soxl_official_ddeolsao_pal_v1",
      "--profile-id",
      "tqqq_official_ddeolsao_pal_v1",
    ]),
  );
  assert.deepEqual(targets, [
    { workspaceId: "soxl", profileId: "soxl_official_ddeolsao_pal_v1" },
    { workspaceId: "tqqq", profileId: "tqqq_official_ddeolsao_pal_v1" },
  ]);
});
