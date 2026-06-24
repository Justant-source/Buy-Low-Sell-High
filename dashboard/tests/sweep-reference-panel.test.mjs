import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

function loadHooks() {
  const sourcePath = path.resolve(import.meta.dirname, "../public/js/sweep-reference-panel.js");
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
      },
    },
    document: {
      getElementById() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
    },
    console,
  };
  context.window.document = context.document;
  vm.runInNewContext(source, context, { filename: sourcePath });
  return context.window.__sweepReferencePanelTestHooks;
}

function rawRow({
  comboKey,
  threadCount,
  stopSessions,
  buyPct,
  sellPct,
  meanCagr,
  fullMdd,
  recentMdd,
  plateauClass,
  tierPass,
  pareto,
}) {
  return {
    combo_key: comboKey,
    params: {
      thread_count: threadCount,
      stop_sessions: stopSessions,
      buy_pct: buyPct,
      sell_pct: sellPct,
    },
    metrics: {
      mean_cagr_pct: meanCagr,
      cagr_pct: meanCagr,
      max_drawdown_pct: fullMdd,
      recent_mdd_pct: recentMdd,
      recent_cagr_pct: meanCagr,
      worst_window_cagr_pct: meanCagr - 10,
      compound_ratio: 2.1,
      compound_ratio_log10: 0.322,
    },
    plateau_class: plateauClass,
    tier_pass: tierPass,
    flags: {
      pareto_return_mdd: pareto,
      pareto_return_stability: false,
    },
  };
}

test("template keeps original boxes first and adds ranked recommendation boxes at the bottom", () => {
  const hooks = loadHooks();
  const html = hooks.templateHtml();
  assert.equal(html.includes("신규 추천 박스"), true);
  assert.equal(html.includes("추천 후보 표"), true);
  assert.equal(html.includes('aria-label="추천 순위 1"'), true);
  assert.equal(html.includes('aria-label="추천 순위 2"'), true);
  assert.equal(html.includes('aria-label="추천 순위 3"'), true);
});

test("balanced comparator prefers eligible plateau candidate over non-plateau peers", () => {
  const hooks = loadHooks();
  const plateau = hooks.makeDisplayRow(rawRow({
    comboKey: "combo-plateau",
    threadCount: 5,
    stopSessions: 40,
    buyPct: 0,
    sellPct: 0,
    meanCagr: 14,
    fullMdd: -42,
    recentMdd: -32,
    plateauClass: "P",
    tierPass: true,
    pareto: false,
  }));
  const mixedPareto = hooks.makeDisplayRow(rawRow({
    comboKey: "combo-mixed",
    threadCount: 5,
    stopSessions: 30,
    buyPct: -2,
    sellPct: 3,
    meanCagr: 18,
    fullMdd: -35,
    recentMdd: -25,
    plateauClass: "M",
    tierPass: true,
    pareto: true,
  }));
  const ineligible = hooks.makeDisplayRow(rawRow({
    comboKey: "combo-risky",
    threadCount: 7,
    stopSessions: 10,
    buyPct: -4,
    sellPct: 5,
    meanCagr: 22,
    fullMdd: -82,
    recentMdd: -58,
    plateauClass: "P",
    tierPass: true,
    pareto: true,
  }));
  const rows = [mixedPareto, plateau, ineligible].sort(hooks.compareBalancedRows);
  assert.deepEqual(rows.map((row) => row.comboKey), ["combo-plateau", "combo-mixed", "combo-risky"]);
  assert.equal(hooks.isEligibleCandidate(ineligible), false);
});

test("return and defense comparators favor different eligible candidates", () => {
  const hooks = loadHooks();
  const returnLeader = hooks.makeDisplayRow(rawRow({
    comboKey: "combo-return",
    threadCount: 6,
    stopSessions: 30,
    buyPct: -2,
    sellPct: 4,
    meanCagr: 21,
    fullMdd: -48,
    recentMdd: -42,
    plateauClass: "M",
    tierPass: true,
    pareto: true,
  }));
  const defenseLeader = hooks.makeDisplayRow(rawRow({
    comboKey: "combo-defense",
    threadCount: 5,
    stopSessions: 40,
    buyPct: 0,
    sellPct: 0,
    meanCagr: 13,
    fullMdd: -33,
    recentMdd: -22,
    plateauClass: "P",
    tierPass: true,
    pareto: false,
  }));
  const byReturn = [defenseLeader, returnLeader].sort(hooks.compareReturnRows);
  const byDefense = [defenseLeader, returnLeader].sort(hooks.compareDefenseRows);
  assert.equal(byReturn[0].comboKey, "combo-return");
  assert.equal(byDefense[0].comboKey, "combo-defense");
});

test("parameter evidence matrix aggregates filtered rows by parameter value", () => {
  const hooks = loadHooks();
  const rows = [
    hooks.makeDisplayRow(rawRow({
      comboKey: "combo-a",
      threadCount: 5,
      stopSessions: 30,
      buyPct: 0,
      sellPct: 0,
      meanCagr: 12,
      fullMdd: -40,
      recentMdd: -28,
      plateauClass: "P",
      tierPass: true,
      pareto: true,
    })),
    hooks.makeDisplayRow(rawRow({
      comboKey: "combo-b",
      threadCount: 5,
      stopSessions: 40,
      buyPct: -2,
      sellPct: 0,
      meanCagr: 10,
      fullMdd: -44,
      recentMdd: -36,
      plateauClass: "M",
      tierPass: true,
      pareto: false,
    })),
    hooks.makeDisplayRow(rawRow({
      comboKey: "combo-c",
      threadCount: 6,
      stopSessions: 40,
      buyPct: -2,
      sellPct: 3,
      meanCagr: 8,
      fullMdd: -55,
      recentMdd: -49,
      plateauClass: "I",
      tierPass: false,
      pareto: false,
    })),
  ];
  const matrix = hooks.buildParameterEvidenceMatrix(rows);
  const threadFive = matrix.find((row) => row.parameterKey === "thread_count" && row.value === 5);
  const buyMinusTwo = matrix.find((row) => row.parameterKey === "buy_pct" && row.value === -2);
  assert.equal(threadFive.count, 2);
  assert.equal(threadFive.robustRatioPct, 100);
  assert.equal(threadFive.plateauRatioPct, 50);
  assert.equal(Number(buyMinusTwo.meanCagr.toFixed(1)), 9);
  assert.equal(Number(buyMinusTwo.recentMdd.toFixed(1)), -42.5);
});
