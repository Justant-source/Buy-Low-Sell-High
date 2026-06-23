import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultStrategyPresetWarmupVariants,
  strategyPresetWarmupPlan,
  strategyDetailPayloadMatchesCurrentCode,
  strategyRankingPayloadMatchesCurrentCode,
  threadTimelinePayloadMatchesCurrentCode,
} from "../dist/lib/backtest-service.js";
import { currentCodeCommit } from "../dist/lib/code-version.js";

const CURRENT_CODE_COMMIT = currentCodeCommit();
const STALE_CODE_COMMIT = `${CURRENT_CODE_COMMIT}-stale`;

test("strategy ranking cache helper rejects stale code commits", () => {
  assert.equal(
    strategyRankingPayloadMatchesCurrentCode({
      meta: { code_commit: CURRENT_CODE_COMMIT },
      rows: [],
    }),
    true,
  );
  assert.equal(
    strategyRankingPayloadMatchesCurrentCode({
      meta: { code_commit: STALE_CODE_COMMIT },
      rows: [],
    }),
    false,
  );
});

test("strategy detail cache helper rejects stale code commits", () => {
  assert.equal(
    strategyDetailPayloadMatchesCurrentCode({
      meta: { code_commit: CURRENT_CODE_COMMIT },
      daily: [],
    }),
    true,
  );
  assert.equal(
    strategyDetailPayloadMatchesCurrentCode({
      meta: { code_commit: STALE_CODE_COMMIT },
      daily: [],
    }),
    false,
  );
});

test("thread timeline cache helper rejects stale code commits", () => {
  assert.equal(
    threadTimelinePayloadMatchesCurrentCode({
      meta: { code_commit: CURRENT_CODE_COMMIT },
      lanes: [],
      sessions: [],
      summary: {},
    }),
    true,
  );
  assert.equal(
    threadTimelinePayloadMatchesCurrentCode({
      meta: { code_commit: STALE_CODE_COMMIT },
      lanes: [],
      sessions: [],
      summary: {},
    }),
    false,
  );
});

test("default SOXL preset warmup includes regime-on defaults", () => {
  const soxlVariants = defaultStrategyPresetWarmupVariants("soxl");
  assert.equal(soxlVariants.length, 2);
  assert.equal(soxlVariants[0].label, "baseline");
  assert.equal(soxlVariants[1].label, "regime-default");
  assert.deepEqual(soxlVariants[1].overrides, {
    regimeEnabled: true,
    regimeSymbol: "QQQ",
    regimeRsiPeriodWeeks: 14,
    regimeBearHighThreshold: 45,
    regimeBearMidLowThreshold: 45,
    regimeBearMidHighThreshold: 45,
    regimeBullLowThreshold: 55,
    regimeBullMidLowThreshold: 55,
    regimeBullMidHighThreshold: 55,
    regimeBaseStopSessions: 40,
    regimeBaseBuyPct: 0,
    regimeBaseSellPct: 0,
    regimeBullStopSessions: 30,
    regimeBullBuyPct: 0,
    regimeBullSellPct: 0,
    regimeBearStopSessions: 40,
    regimeBearBuyPct: 0,
    regimeBearSellPct: 0,
  });
  assert.deepEqual(defaultStrategyPresetWarmupVariants("tqqq"), [{ label: "baseline" }]);
});

test("preset warmup plan primes top detail ids and first timeline id", () => {
  assert.deepEqual(
    strategyPresetWarmupPlan({
      rows: [
        { strategy_id: "combo-a" },
        { strategy_id: "combo-b" },
        { strategy_id: "combo-a" },
        { strategy_id: "combo-c" },
        { strategy_id: "combo-d" },
      ],
    }),
    {
      detailStrategyIds: ["combo-a", "combo-b", "combo-c"],
      timelineStrategyId: "combo-a",
    },
  );
});
