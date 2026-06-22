import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

function loadHooks() {
  const sourcePath = path.resolve(import.meta.dirname, "../public/js/backtests-dashboard.js");
  const source = readFileSync(sourcePath, "utf8");
  const context = {
    window: {
      SOXLDashboard: {
        escapeHtml(value) {
          return String(value ?? "");
        },
        formatPercent(value) {
          return `${Number(value).toFixed(2)}%`;
        },
        formatNumber(value) {
          return String(value);
        },
        formatMoney(value) {
          return String(value);
        },
        fetchJson() {
          throw new Error("fetchJson should not be called in unit tests");
        },
        isAbortError() {
          return false;
        },
        setText() {},
      },
      addEventListener() {},
      location: { pathname: "/backtests/soxl" },
    },
    document: {
      addEventListener() {},
      getElementById() {
        return null;
      },
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
      documentElement: {},
    },
    console,
    URLSearchParams,
    getComputedStyle() {
      return {
        getPropertyValue() {
          return "";
        },
      };
    },
  };
  context.window.document = context.document;
  vm.runInNewContext(source, context, { filename: sourcePath });
  return context.window.__strategyDashboardTestHooks;
}

function detailPayload({
  strategyId,
  start,
  end,
  endEquity,
  executionModel = "next_open",
  priceBasis = "adjusted_close",
  regimeEnabled = false,
  regimeConfigHash = "",
}) {
  return {
    strategy_id: strategyId,
    meta: {
      strategy_id: strategyId,
      symbol: "SOXL",
      initial_capital: "10000",
      price_basis: priceBasis,
      execution_model: executionModel,
      period_start: start,
      period_end: end,
      data_hash: "fixture-hash",
      config_hash: "fixture-config",
      code_commit: "fixture-commit",
      regime_enabled: regimeEnabled,
      regime_config_hash: regimeConfigHash,
    },
    daily: [
      { session_date: start, total_equity: "10000.00" },
      { session_date: end, total_equity: String(endEquity) },
    ],
  };
}

test("strategy detail keys are slice-aware", () => {
  const hooks = loadHooks();
  const left = hooks.makeStrategyDetailStateKey({
    profileId: "soxl",
    strategyId: "t5-s40-buy-2-sell+0",
    csvPath: "/tmp/soxl.csv",
    executionModel: "next_open",
    priceBasis: "adjusted_close",
    sliceStart: "2019-01-01",
    sliceEnd: "2024-12-31",
  });
  const right = hooks.makeStrategyDetailStateKey({
    profileId: "soxl",
    strategyId: "t5-s40-buy-2-sell+0",
    csvPath: "/tmp/soxl.csv",
    executionModel: "next_open",
    priceBasis: "adjusted_close",
    sliceStart: "2020-01-01",
    sliceEnd: "2024-12-31",
  });
  assert.notEqual(left, right);
});

test("strategy detail context validation rejects mismatched periods", () => {
  const hooks = loadHooks();
  const context = {
    profileId: "soxl",
    strategyId: "t5-s40-buy-2-sell+0",
    csvPath: "/tmp/soxl.csv",
    executionModel: "next_open",
    priceBasis: "adjusted_close",
    sliceStart: "2019-01-01",
    sliceEnd: "2024-12-31",
  };
  const matching = detailPayload({
    strategyId: context.strategyId,
    start: context.sliceStart,
    end: context.sliceEnd,
    endEquity: "48605.00",
  });
  const mismatched = detailPayload({
    strategyId: context.strategyId,
    start: "2018-01-01",
    end: context.sliceEnd,
    endEquity: "48605.00",
  });
  assert.equal(hooks.strategyDetailMatchesContext(matching, context), true);
  assert.equal(hooks.strategyDetailMatchesContext(mismatched, context), false);
});

test("strategy detail normalization backfills legacy responses and actual trading dates", () => {
  const hooks = loadHooks();
  const context = {
    profileId: "soxl",
    strategyId: "t5-s40-buy-2-sell+0",
    csvPath: "/tmp/soxl.csv",
    executionModel: "next_open",
    priceBasis: "adjusted_close",
    sliceStart: "2019-01-02",
    sliceEnd: "2024-12-31",
  };
  const normalized = hooks.normalizeStrategyDetailPayload(
    {
      strategy_id: context.strategyId,
      config_hash: "fixture-config",
      daily: [
        { session_date: "2019-01-02", total_equity: "10000.00" },
        { session_date: "2024-12-31", total_equity: "48605.00" },
      ],
    },
    context,
  );
  assert.equal(normalized.meta.strategy_id, context.strategyId);
  assert.equal(normalized.meta.period_start, "2019-01-02");
  assert.equal(normalized.meta.period_end, "2024-12-31");
  assert.equal(hooks.strategyDetailMatchesContext(normalized, context), true);
});

test("strategy detail acceptance rejects stale requests and ranking mismatches", () => {
  const hooks = loadHooks();
  const context = {
    profileId: "soxl",
    strategyId: "t5-s40-buy-2-sell+0",
    csvPath: "/tmp/soxl.csv",
    executionModel: "next_open",
    priceBasis: "adjusted_close",
    sliceStart: "2019-01-01",
    sliceEnd: "2024-12-31",
  };
  const rankingRow = { full_return_pct: 386.05 };
  const matching = detailPayload({
    strategyId: context.strategyId,
    start: context.sliceStart,
    end: context.sliceEnd,
    endEquity: "48605.00",
  });
  const mismatched = detailPayload({
    strategyId: context.strategyId,
    start: context.sliceStart,
    end: context.sliceEnd,
    endEquity: "19000.00",
  });

  assert.equal(hooks.strategyDetailReturnPct(matching), 386.05);
  assert.equal(hooks.strategyDetailMatchesRanking(matching, rankingRow), true);
  assert.equal(hooks.strategyDetailMatchesRanking(mismatched, rankingRow), false);
  assert.equal(
    hooks.shouldAcceptStrategyDetailPayload({
      activeRequestId: 3,
      requestId: 2,
      payload: matching,
      context,
      rankingRow,
    }),
    false,
  );
  assert.equal(
    hooks.shouldAcceptStrategyDetailPayload({
      activeRequestId: 3,
      requestId: 3,
      payload: mismatched,
      context,
      rankingRow,
    }),
    false,
  );
  assert.equal(
    hooks.shouldAcceptStrategyDetailPayload({
      activeRequestId: 3,
      requestId: 3,
      payload: matching,
      context,
      rankingRow,
    }),
    true,
  );
});

test("thread timeline acceptance rejects stale requests", () => {
  const hooks = loadHooks();
  const context = {
    profileId: "soxl",
    strategyId: "t5-s40-buy-2-sell+0",
    csvPath: "/tmp/soxl.csv",
    executionModel: "next_open",
    priceBasis: "adjusted_close",
    sliceStart: "2019-01-01",
    sliceEnd: "2024-12-31",
  };
  const payload = {
    meta: {
      strategy_id: context.strategyId,
      period_start: context.sliceStart,
      period_end: context.sliceEnd,
      execution_model: context.executionModel,
      price_basis: context.priceBasis,
    },
  };
  assert.equal(hooks.threadTimelineMatchesContext(payload, context), true);
  assert.equal(
    hooks.shouldAcceptThreadTimelinePayload({
      activeRequestId: 7,
      requestId: 6,
      payload,
      context,
    }),
    false,
  );
  assert.equal(
    hooks.shouldAcceptThreadTimelinePayload({
      activeRequestId: 7,
      requestId: 7,
      payload,
      context,
    }),
    true,
  );
});

test("strategy detail and thread timeline contexts reject mismatched regime hashes", () => {
  const hooks = loadHooks();
  const context = {
    profileId: "soxl",
    strategyId: "rt5-bst40-bbuy-2-bsell+3-rst10-rbuy-5-rsell+1",
    csvPath: "/tmp/soxl.csv",
    executionModel: "next_open",
    priceBasis: "adjusted_close",
    sliceStart: "2019-01-01",
    sliceEnd: "2024-12-31",
    regimeEnabled: true,
    regimeConfigHash: "regime-hash-a",
  };
  const matchingDetail = detailPayload({
    strategyId: context.strategyId,
    start: context.sliceStart,
    end: context.sliceEnd,
    endEquity: "48605.00",
    regimeEnabled: true,
    regimeConfigHash: "regime-hash-a",
  });
  const mismatchedDetail = detailPayload({
    strategyId: context.strategyId,
    start: context.sliceStart,
    end: context.sliceEnd,
    endEquity: "48605.00",
    regimeEnabled: true,
    regimeConfigHash: "regime-hash-b",
  });
  const matchingTimeline = {
    meta: {
      strategy_id: context.strategyId,
      period_start: context.sliceStart,
      period_end: context.sliceEnd,
      execution_model: context.executionModel,
      price_basis: context.priceBasis,
      regime_enabled: true,
      regime_config_hash: "regime-hash-a",
    },
  };
  const mismatchedTimeline = {
    meta: {
      ...matchingTimeline.meta,
      regime_config_hash: "regime-hash-b",
    },
  };

  assert.equal(hooks.strategyDetailMatchesContext(matchingDetail, context), true);
  assert.equal(hooks.strategyDetailMatchesContext(mismatchedDetail, context), false);
  assert.equal(hooks.threadTimelineMatchesContext(matchingTimeline, context), true);
  assert.equal(hooks.threadTimelineMatchesContext(mismatchedTimeline, context), false);
});
