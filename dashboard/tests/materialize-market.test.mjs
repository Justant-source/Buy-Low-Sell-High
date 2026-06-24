import assert from "node:assert/strict";
import test from "node:test";

import { parseMaterializeMarketCliArgs } from "../dist/materialize-market.js";
import {
  getMarketRefreshDefinition,
  resolveMarketMaterializationTargets,
} from "../dist/lib/market-refresh.js";

test("materialize market CLI parser accepts repeated profile ids and numeric overrides", () => {
  const args = parseMaterializeMarketCliArgs([
    "--market",
    "us",
    "--profile-id",
    "soxl_default_5x30,tqqq_default_5x30",
    "--profile-id",
    "koru_default_5x30",
    "--max-workers",
    "4",
    "--sweep-max-workers",
    "6",
    "--sweep-chunk-size",
    "12",
  ]);
  assert.equal(args.market, "us");
  assert.deepEqual(args.profileIds, ["soxl_default_5x30", "tqqq_default_5x30", "koru_default_5x30"]);
  assert.equal(args.maxWorkers, 4);
  assert.equal(args.sweepMaxWorkers, 6);
  assert.equal(args.sweepChunkSize, 12);
});

test("market refresh config exposes expected cron metadata", () => {
  const kr = getMarketRefreshDefinition("kr");
  const us = getMarketRefreshDefinition("us");

  assert.equal(kr.cron_timezone, "Asia/Seoul");
  assert.equal(kr.cron_schedule, "40 15 * * 1-5");
  assert.equal(us.cron_timezone, "America/New_York");
  assert.equal(us.cron_schedule, "10 16 * * 1-5");
});

test("market target resolution defaults to all configured profiles and preserves config order", () => {
  const targets = resolveMarketMaterializationTargets("kr");
  assert.deepEqual(
    targets.slice(0, 3).map((target) => target.profile_id),
    ["0193t0_default_5x30", "0193t0_default_7x30", "0193t0_best_avg_5x40"],
  );
});

test("market target resolution filters explicit subset and deduplicates repeated profile ids", () => {
  const targets = resolveMarketMaterializationTargets("us", [
    "tqqq_default_5x30",
    "soxl_default_5x30",
    "tqqq_default_5x30",
  ]);
  assert.deepEqual(
    targets.map((target) => target.profile_id),
    ["soxl_default_5x30", "tqqq_default_5x30"],
  );
});
