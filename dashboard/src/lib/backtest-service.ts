import { createHash } from "node:crypto";

import { codeCommitMatchesCurrent } from "./code-version.js";
import { HttpError } from "./http.js";
import { getDataStatus } from "./data-service.js";
import { defaultCsvPathForSymbol } from "./paths.js";
import { getProfileDefinition } from "./profiles.js";
import { runCliJson } from "./python.js";
import { getResearchStore, newResearchArtifactId } from "./research-store.js";
import { requestStrategyRankingFromDaemon } from "./strategy-ranking-daemon-client.js";
import { listWorkspaceDefinitions } from "./workspaces.js";
import {
  listJobs,
  listRunArtifacts,
  loadJob,
  loadMentorMatrixArtifact,
  loadOfficialMatrixArtifact,
  loadRunArtifact,
  newJobId,
  saveJob,
  saveMentorMatrixArtifact,
  saveOfficialMatrixArtifact,
  saveRunArtifact,
} from "./runtime-store.js";
import type {
  BacktestDetailPayload,
  OfficialExplorerPayload,
  OfficialMatrixPayload,
  BacktestOverrides,
  BacktestRiskPayload,
  DashboardJobRecord,
  GridCellPayload,
  MentorMatrixPayload,
  ParameterSweepPayload,
  PersistedRunArtifact,
  ParameterSweepRowPayload,
  ProfilePayload,
  ProfileShowPayload,
  ResearchArtifactRecord,
  StrategyExplorerPayload,
  StrategyExplorerStrategyPayload,
  StrategyRankingPayload,
  StrategyRankingRowPayload,
  ThreadTimelinePayload,
} from "./types.js";

const STRATEGY_EXPLORER_VERSION = "strategy-explorer-v4";
const STRATEGY_RANKING_VERSION = "strategy-ranking-v7";
const STRATEGY_DETAIL_VERSION = "strategy-detail-v1";
const THREAD_TIMELINE_VERSION = "thread-timeline-v1";
const PARAMETER_SWEEP_VERSION = "parameter-sweep-v5";
const DEFAULT_RESEARCH_EXECUTION_MODEL = "next_open";
const DEFAULT_STRATEGY_CATALOG_ID = "core_profiles_v2";
const DEFAULT_SWEEP_ID = "core4_v4";
const STRATEGY_RANKING_BASIS = "cagr desc, max_drawdown desc, full_return desc, combo_key asc";
const SWEEP_RANKING_BASIS = "cagr desc, max_drawdown desc, full_return desc";

function resolveCsvPath(csvPath: string | undefined, symbol: string): string {
  return csvPath ?? defaultCsvPathForSymbol(symbol);
}

export interface BacktestJobInput {
  profileId: string;
  csvPath?: string;
  initialCapital?: number;
  overrides?: BacktestOverrides;
}

export interface CompareInput {
  profileId: string;
  csvPath?: string;
  initialCapital?: number;
  threads: number[];
  stops: number[];
  overrides?: BacktestOverrides;
}

export interface MentorMatrixInput {
  profileId: string;
  csvPath?: string;
  initialCapital?: number;
  threads: number[];
  stops: number[];
  overrides?: BacktestOverrides;
}

export interface StrategyExplorerInput {
  profileId: string;
  csvPath?: string;
  initialCapital?: number;
  catalogId?: string;
  executionModel?: string;
  priceBasis?: string;
  overrides?: BacktestOverrides;
}

export interface StrategyRankingInput {
  profileId: string;
  csvPath?: string;
  initialCapital?: number;
  executionModel?: string;
  priceBasis?: string;
  sliceStart?: string;
  sliceEnd?: string;
  limit?: number;
  overrides?: BacktestOverrides;
}

export interface StrategyDetailInput {
  profileId: string;
  csvPath?: string;
  initialCapital?: number;
  strategyId: string;
  sliceStart?: string;
  sliceEnd?: string;
  executionModel?: string;
  priceBasis?: string;
  overrides?: BacktestOverrides;
}

export interface OfficialExplorerInput {
  profileId: string;
  csvPath?: string;
  initialCapital?: number;
}

export interface ThreadTimelineInput {
  profileId: string;
  csvPath?: string;
  initialCapital?: number;
  strategyId: string;
  sliceStart?: string;
  sliceEnd?: string;
  executionModel?: string;
  priceBasis?: string;
  overrides?: BacktestOverrides;
}

export interface SweepJobInput {
  profileId: string;
  csvPath?: string;
  initialCapital?: number;
  sweepId?: string;
  executionModel?: string;
  priceBasis?: string;
}

export interface OfficialMatrixInput {
  profileId: string;
  csvPath?: string;
  initialCapital?: number;
  threads: number[];
  stops: number[];
  overrides?: BacktestOverrides;
}

function buildOverrideArgs(
  overrides?: BacktestOverrides,
  options: { includeThreadCount?: boolean; includeStopSessions?: boolean; includePriceBasis?: boolean } = {},
): string[] {
  if (!overrides) {
    return [];
  }
  const args: string[] = [];
  const includeThreadCount = options.includeThreadCount ?? true;
  const includeStopSessions = options.includeStopSessions ?? true;
  const includePriceBasis = options.includePriceBasis ?? true;
  if (includeThreadCount && overrides.threadCount != null) {
    args.push("--thread-count", String(overrides.threadCount));
  }
  if (includeStopSessions && overrides.stopSessions != null) {
    args.push("--stop-sessions", String(overrides.stopSessions));
  }
  if (overrides.takeProfitPct != null) {
    args.push("--take-profit-pct", String(overrides.takeProfitPct));
  }
  if (overrides.takeProfitOperator) {
    args.push("--take-profit-operator", overrides.takeProfitOperator);
  }
  if (overrides.entryDropPct != null) {
    args.push("--entry-drop-pct", String(overrides.entryDropPct));
  }
  if (overrides.stopLossPct != null) {
    args.push("--stop-loss-pct", String(overrides.stopLossPct));
  }
  if (overrides.maxEntriesPerSession != null) {
    args.push("--max-entries-per-session", String(overrides.maxEntriesPerSession));
  }
  if (overrides.sizingMode) {
    args.push("--sizing-mode", overrides.sizingMode);
  }
  if (includePriceBasis && overrides.priceBasis) {
    args.push("--price-basis", overrides.priceBasis);
  }
  if (overrides.regimeEnabled) {
    args.push("--regime-enabled");
  }
  if (overrides.regimeSymbol) {
    args.push("--regime-symbol", overrides.regimeSymbol);
  }
  if (overrides.regimeRsiPeriodWeeks != null) {
    args.push("--regime-rsi-period-weeks", String(overrides.regimeRsiPeriodWeeks));
  }
  if (overrides.regimeBearHighThreshold != null) {
    args.push("--regime-bear-high-threshold", String(overrides.regimeBearHighThreshold));
  }
  if (overrides.regimeBearMidLowThreshold != null) {
    args.push("--regime-bear-mid-low-threshold", String(overrides.regimeBearMidLowThreshold));
  }
  if (overrides.regimeBearMidHighThreshold != null) {
    args.push("--regime-bear-mid-high-threshold", String(overrides.regimeBearMidHighThreshold));
  }
  if (overrides.regimeBullLowThreshold != null) {
    args.push("--regime-bull-low-threshold", String(overrides.regimeBullLowThreshold));
  }
  if (overrides.regimeBullMidLowThreshold != null) {
    args.push("--regime-bull-mid-low-threshold", String(overrides.regimeBullMidLowThreshold));
  }
  if (overrides.regimeBullMidHighThreshold != null) {
    args.push("--regime-bull-mid-high-threshold", String(overrides.regimeBullMidHighThreshold));
  }
  if (overrides.regimeBaseStopSessions != null) {
    args.push("--regime-base-stop-sessions", String(overrides.regimeBaseStopSessions));
  }
  if (overrides.regimeBaseBuyPct != null) {
    args.push("--regime-base-buy-pct", String(overrides.regimeBaseBuyPct));
  }
  if (overrides.regimeBaseSellPct != null) {
    args.push("--regime-base-sell-pct", String(overrides.regimeBaseSellPct));
  }
  if (overrides.regimeBullStopSessions != null) {
    args.push("--regime-bull-stop-sessions", String(overrides.regimeBullStopSessions));
  }
  if (overrides.regimeBullBuyPct != null) {
    args.push("--regime-bull-buy-pct", String(overrides.regimeBullBuyPct));
  }
  if (overrides.regimeBullSellPct != null) {
    args.push("--regime-bull-sell-pct", String(overrides.regimeBullSellPct));
  }
  if (overrides.regimeBearStopSessions != null) {
    args.push("--regime-bear-stop-sessions", String(overrides.regimeBearStopSessions));
  }
  if (overrides.regimeBearBuyPct != null) {
    args.push("--regime-bear-buy-pct", String(overrides.regimeBearBuyPct));
  }
  if (overrides.regimeBearSellPct != null) {
    args.push("--regime-bear-sell-pct", String(overrides.regimeBearSellPct));
  }
  return args;
}

function buildResearchArgs(input: {
  catalogId?: string;
  sweepId?: string;
  executionModel?: string;
  priceBasis?: string;
}): string[] {
  const args: string[] = [];
  if (input.catalogId) {
    args.push("--catalog-id", input.catalogId);
  }
  if (input.sweepId) {
    args.push("--sweep-id", input.sweepId);
  }
  args.push("--execution-model", input.executionModel ?? DEFAULT_RESEARCH_EXECUTION_MODEL);
  args.push("--price-basis", input.priceBasis ?? "adjusted_close");
  return args;
}

function defaultStrategyExecutionModel(profile: ProfilePayload | ReturnType<typeof getProfileDefinition>): string {
  return profile?.executionModel ?? "ideal_same_close";
}

function defaultStrategyPriceBasis(profile: ProfilePayload | ReturnType<typeof getProfileDefinition>): string {
  return profile?.priceBasis ?? "adjusted_close";
}

function defaultSweepExecutionModel(): string {
  return DEFAULT_RESEARCH_EXECUTION_MODEL;
}

function defaultSweepPriceBasis(profile: ProfilePayload | ReturnType<typeof getProfileDefinition>): string {
  return profile?.priceBasis ?? "adjusted_close";
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}

function annualizedReturnPct(fullReturnPct: number, periodStart: string, periodEnd: string): number {
  if (!Number.isFinite(fullReturnPct)) {
    return 0;
  }
  const startAt = Date.parse(`${periodStart}T00:00:00Z`);
  const endAt = Date.parse(`${periodEnd}T00:00:00Z`);
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt) {
    return roundMetric(fullReturnPct);
  }
  const growthRatio = 1 + (fullReturnPct / 100);
  if (growthRatio <= 0) {
    return -100;
  }
  const elapsedDays = (endAt - startAt) / (1000 * 60 * 60 * 24);
  if (elapsedDays <= 0) {
    return roundMetric(fullReturnPct);
  }
  return roundMetric((Math.pow(growthRatio, 365 / elapsedDays) - 1) * 100);
}

function compareStrategyRankingRows(left: StrategyRankingRowPayload, right: StrategyRankingRowPayload): number {
  if (right.cagr_pct !== left.cagr_pct) {
    return right.cagr_pct - left.cagr_pct;
  }
  if (right.max_drawdown_pct !== left.max_drawdown_pct) {
    return right.max_drawdown_pct - left.max_drawdown_pct;
  }
  if (right.full_return_pct !== left.full_return_pct) {
    return right.full_return_pct - left.full_return_pct;
  }
  return left.combo_key.localeCompare(right.combo_key);
}

function compareSweepRows(left: ParameterSweepRowPayload, right: ParameterSweepRowPayload): number {
  if (right.metrics.cagr_pct !== left.metrics.cagr_pct) {
    return right.metrics.cagr_pct - left.metrics.cagr_pct;
  }
  if (right.metrics.max_drawdown_pct !== left.metrics.max_drawdown_pct) {
    return right.metrics.max_drawdown_pct - left.metrics.max_drawdown_pct;
  }
  if (right.metrics.full_return_pct !== left.metrics.full_return_pct) {
    return right.metrics.full_return_pct - left.metrics.full_return_pct;
  }
  return left.combo_key.localeCompare(right.combo_key);
}

function normalizeSweepWarnings(
  payload: ParameterSweepPayload,
  bestFull: ParameterSweepRowPayload | null,
  bestRobust: ParameterSweepRowPayload | null,
): string[] {
  const warnings = (payload.warnings || []).filter(
    (warning) => !/(최근|구간 표준편차|drift|segment std|recent)/i.test(warning),
  );
  if (bestFull && bestFull.metrics.max_drawdown_pct < -60) {
    warnings.push(`최고 전체수익 조합 ${bestFull.combo_key} 는 MDD가 ${bestFull.metrics.max_drawdown_pct.toFixed(2)}% 입니다.`);
  }
  if (bestRobust && bestRobust.metrics.cagr_pct < 0) {
    warnings.push(`CAGR 기준 상위 조합 ${bestRobust.combo_key} 는 연환산 수익률이 ${bestRobust.metrics.cagr_pct.toFixed(2)}% 입니다.`);
  }
  return [...new Set(warnings)];
}

function normalizeSweepPayload(payload: ParameterSweepPayload): ParameterSweepPayload {
  const rows = (payload.rows || [])
    .map((row) => ({
      ...row,
      metrics: {
        ...row.metrics,
        cagr_pct: Number.isFinite(row.metrics?.cagr_pct)
          ? row.metrics.cagr_pct
          : annualizedReturnPct(row.metrics.full_return_pct, payload.meta.period_start, payload.meta.period_end),
      },
    }))
    .sort(compareSweepRows);
  const bestFull = rows.reduce<ParameterSweepRowPayload | null>((best, row) => {
    if (!best) {
      return row;
    }
    if (row.metrics.full_return_pct !== best.metrics.full_return_pct) {
      return row.metrics.full_return_pct > best.metrics.full_return_pct ? row : best;
    }
    return compareSweepRows(row, best) < 0 ? row : best;
  }, null);
  const bestRobust = rows[0] ?? null;
  return {
    ...payload,
    summary: {
      ...payload.summary,
      best_full_return_combo: bestFull?.combo_key ?? payload.summary.best_full_return_combo,
      best_robust_combo: bestRobust?.combo_key ?? payload.summary.best_robust_combo,
      pareto_return_mdd_count: rows.filter((row) => row.flags.pareto_return_mdd).length,
      pareto_return_stability_count: rows.filter((row) => row.flags.pareto_return_stability).length,
      ranking_basis: SWEEP_RANKING_BASIS,
    },
    warnings: normalizeSweepWarnings(payload, bestFull, bestRobust),
    rows,
  };
}

async function resolveProfileContext(input: {
  profileId: string;
  csvPath?: string;
  initialCapital?: number;
  overrides?: BacktestOverrides;
}): Promise<{
  profile: NonNullable<ReturnType<typeof getProfileDefinition>>;
  profilePayload: ProfilePayload;
  csvPath: string;
  initialCapital: number;
}> {
  const requestedInitialCapital = input.initialCapital ?? 10000;
  const profile = getProfileDefinition(input.profileId);
  if (!profile) {
    throw new HttpError(404, `Unknown profileId: ${input.profileId}`);
  }
  const csvPath = resolveCsvPath(input.csvPath, profile.symbol);
  const profilePayload = await resolveProfilePayload(input.profileId, requestedInitialCapital, input.overrides);
  const initialCapital = Number(profilePayload.initialCapital);
  if (!Number.isFinite(initialCapital)) {
    throw new HttpError(500, `Invalid initial capital for profileId: ${input.profileId}`);
  }
  return { profile, profilePayload, csvPath, initialCapital };
}

function resolveProfilePayload(staticProfileId: string, initialCapital: number, overrides?: BacktestOverrides): Promise<ProfilePayload> {
  const profile = getProfileDefinition(staticProfileId);
  if (!profile) {
    throw new HttpError(404, `Unknown profileId: ${staticProfileId}`);
  }
  return runCliJson<ProfileShowPayload>([
    "profile",
    "show",
    "--profile",
    profile.profilePath,
    "--initial-capital",
    String(initialCapital),
    ...buildOverrideArgs(overrides),
  ]).then((payload) => ({
    ...profile,
    configHash: payload.config_hash as string,
    initialCapital: payload.initial_capital as string,
  }));
}

function tradesToCsv(run: BacktestDetailPayload): string {
  const header = [
    "thread_id",
    "signal_date",
    "fill_entry_date",
    "entry_price",
    "shares",
    "invested_amount",
    "entry_fee",
    "exit_signal_date",
    "fill_exit_date",
    "exit_price",
    "exit_fee",
    "total_fees",
    "holding_sessions",
    "pnl",
    "return_pct",
    "close_reason",
  ];
  const rows = run.trades.map((trade) =>
    [
      trade.thread_id,
      trade.signal_date,
      trade.fill_entry_date,
      trade.entry_price,
      trade.shares,
      trade.invested_amount,
      trade.entry_fee,
      trade.exit_signal_date ?? "",
      trade.fill_exit_date ?? "",
      trade.exit_price ?? "",
      trade.exit_fee,
      trade.total_fees,
      trade.holding_sessions ?? "",
      trade.pnl,
      trade.return_pct,
      trade.close_reason ?? "",
    ]
      .map((value) => {
        const text = String(value ?? "");
        return `"${text.replaceAll("\"", "\"\"")}"`;
      })
      .join(","),
  );
  return `${header.join(",")}\n${rows.join("\n")}\n`;
}

function summarizeArtifact(artifact: PersistedRunArtifact): Record<string, unknown> {
  return {
    runId: artifact.runId,
    profileId: artifact.profileId,
    symbol: artifact.symbol,
    csvPath: artifact.csvPath,
    createdAt: artifact.createdAt,
    dataHash: artifact.dataHash,
    configHash: artifact.configHash,
    metrics: artifact.payload.metrics,
    yearly: artifact.payload.yearly,
  };
}

function shortDigest(parts: Array<string | number | undefined | null>): string {
  const raw = parts.map((part) => String(part ?? "")).join(":");
  return createHash("sha256").update(raw).digest("hex");
}

function stableOverrideKey(overrides?: BacktestOverrides): string {
  if (!overrides || !Object.keys(overrides).length) {
    return "";
  }
  const normalized = Object.fromEntries(
    Object.entries(overrides)
      .filter(([, value]) => value != null && value !== "")
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  return shortDigest([JSON.stringify(normalized)]);
}

function makeStrategyPresetWarmupKey(input: {
  profileId: string;
  csvPath: string;
  dataHash: string;
  initialCapital: number;
  executionModel: string;
  priceBasis: string;
  overridesKey?: string;
}): string {
  return shortDigest([
    "strategy-preset-warmup-v1",
    input.profileId,
    input.csvPath,
    input.dataHash,
    input.initialCapital,
    input.executionModel,
    input.priceBasis,
    input.overridesKey,
  ]);
}

async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= tasks.length) {
        return;
      }
      results[currentIndex] = await tasks[currentIndex]();
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, tasks.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function makeStrategyArtifactKey(input: {
  profileId: string;
  csvPath: string;
  dataHash: string;
  initialCapital: number;
  executionModel: string;
  priceBasis: string;
  catalogId: string;
  overridesKey?: string;
}): string {
  return shortDigest([
    STRATEGY_EXPLORER_VERSION,
    input.profileId,
    input.csvPath,
    input.dataHash,
    input.initialCapital,
    input.executionModel,
    input.priceBasis,
    input.catalogId,
    input.overridesKey,
  ]);
}

function makeSweepArtifactKey(input: {
  profileId: string;
  csvPath: string;
  dataHash: string;
  initialCapital: number;
  executionModel: string;
  priceBasis: string;
  sweepId: string;
}): string {
  return shortDigest([
    PARAMETER_SWEEP_VERSION,
    input.profileId,
    input.csvPath,
    input.dataHash,
    input.initialCapital,
    input.executionModel,
    input.priceBasis,
    input.sweepId,
  ]);
}

function makeStrategyRankingCacheKey(input: {
  profileId: string;
  csvPath: string;
  dataHash: string;
  initialCapital: number;
  executionModel: string;
  priceBasis: string;
  sliceStart?: string;
  sliceEnd?: string;
  overridesKey?: string;
}): string {
  return shortDigest([
    STRATEGY_RANKING_VERSION,
    input.profileId,
    input.csvPath,
    input.dataHash,
    input.initialCapital,
    input.executionModel,
    input.priceBasis,
    input.sliceStart,
    input.sliceEnd,
    input.overridesKey,
  ]);
}

function applyStrategyRankingLimit(payload: StrategyRankingPayload, limit: number): StrategyRankingPayload {
  if (limit <= 0 || payload.rows.length <= limit) {
    return payload;
  }
  return {
    ...payload,
    rows: payload.rows.slice(0, limit),
  };
}

function isCompleteStrategyRankingPayload(payload: StrategyRankingPayload): boolean {
  const comboCount = Number(payload.meta.combo_count || 0);
  return comboCount <= 0 || payload.rows.length >= comboCount;
}

function makeStrategyDetailCacheKey(input: {
  profileId: string;
  csvPath: string;
  dataHash: string;
  initialCapital: number;
  executionModel: string;
  priceBasis: string;
  strategyId: string;
  sliceStart?: string;
  sliceEnd?: string;
  overridesKey?: string;
}): string {
  return shortDigest([
    STRATEGY_DETAIL_VERSION,
    input.profileId,
    input.csvPath,
    input.dataHash,
    input.initialCapital,
    input.executionModel,
    input.priceBasis,
    input.strategyId,
    input.sliceStart,
    input.sliceEnd,
    input.overridesKey,
  ]);
}

function makeThreadTimelineCacheKey(input: {
  profileId: string;
  csvPath: string;
  dataHash: string;
  initialCapital: number;
  executionModel: string;
  priceBasis: string;
  strategyId: string;
  sliceStart?: string;
  sliceEnd?: string;
  overridesKey?: string;
}): string {
  return shortDigest([
    THREAD_TIMELINE_VERSION,
    input.profileId,
    input.csvPath,
    input.dataHash,
    input.initialCapital,
    input.executionModel,
    input.priceBasis,
    input.strategyId,
    input.sliceStart,
    input.sliceEnd,
    input.overridesKey,
  ]);
}

function isReusableResearchArtifact<TPayload>(
  artifact: ResearchArtifactRecord<TPayload> | null | undefined,
): artifact is ResearchArtifactRecord<TPayload> {
  if (!artifact) {
    return false;
  }
  return codeCommitMatchesCurrent(artifact.codeCommit);
}

async function saveStrategyArtifact(
  payload: StrategyExplorerPayload,
  input: {
    artifactKey: string;
    profileId: string;
    symbol: string;
    csvPath: string;
  },
): Promise<ResearchArtifactRecord<StrategyExplorerPayload>> {
  const store = await getResearchStore();
  return store.saveArtifact<StrategyExplorerPayload>({
    artifactId: newResearchArtifactId(),
    artifactKey: input.artifactKey,
    kind: "STRATEGY_EXPLORER",
    profileId: input.profileId,
    symbol: input.symbol,
    csvPath: input.csvPath,
    executionModel: payload.meta.execution_model,
    priceBasis: payload.meta.price_basis,
    dataHash: payload.meta.data_hash,
    codeCommit: payload.meta.code_commit,
    createdAt: new Date().toISOString(),
    catalogId: payload.meta.catalog_id,
    catalogHash: payload.meta.catalog_hash,
    payloadHash: payload.meta.catalog_hash,
    payload,
  });
}

async function saveStrategyRankingArtifact(
  payload: StrategyRankingPayload,
  input: {
    artifactKey: string;
    profileId: string;
    symbol: string;
    csvPath: string;
    sliceStart?: string;
    sliceEnd?: string;
  },
): Promise<ResearchArtifactRecord<StrategyRankingPayload>> {
  const store = await getResearchStore();
  return store.saveArtifact<StrategyRankingPayload>({
    artifactId: newResearchArtifactId(),
    artifactKey: input.artifactKey,
    kind: "STRATEGY_RANKING",
    profileId: input.profileId,
    symbol: input.symbol,
    csvPath: input.csvPath,
    executionModel: payload.meta.execution_model,
    priceBasis: payload.meta.price_basis,
    dataHash: payload.meta.data_hash,
    codeCommit: payload.meta.code_commit,
    createdAt: new Date().toISOString(),
    catalogId: input.sliceStart && input.sliceEnd ? `${input.sliceStart}:${input.sliceEnd}` : "all",
    payloadHash: shortDigest([
      payload.meta.symbol,
      payload.meta.period_start,
      payload.meta.period_end,
      payload.meta.data_hash,
      payload.rows[0]?.strategy_id,
      payload.rows.length,
    ]),
    payload,
  });
}

async function saveSweepArtifact(
  payload: ParameterSweepPayload,
  input: {
    artifactKey: string;
    profileId: string;
    symbol: string;
    csvPath: string;
  },
): Promise<ResearchArtifactRecord<ParameterSweepPayload>> {
  const store = await getResearchStore();
  return store.saveArtifact<ParameterSweepPayload>(
    {
      artifactId: newResearchArtifactId(),
      artifactKey: input.artifactKey,
      kind: "PARAMETER_SWEEP",
      profileId: input.profileId,
      symbol: input.symbol,
      csvPath: input.csvPath,
      executionModel: payload.meta.execution_model,
      priceBasis: payload.meta.price_basis,
      dataHash: payload.meta.data_hash,
      codeCommit: payload.meta.code_commit,
      createdAt: new Date().toISOString(),
      sweepId: payload.meta.sweep_id,
      sweepHash: payload.meta.sweep_hash,
      payloadHash: payload.payload_hash,
      payload,
    },
    payload.rows,
  );
}

export class BacktestService {
  private readonly queuedJobIds = new Set<string>();
  private readonly strategyRankingCache = new Map<string, StrategyRankingPayload>();
  private readonly strategyRankingPending = new Map<string, Promise<StrategyRankingPayload>>();
  private readonly strategyPresetWarmupPending = new Map<string, Promise<void>>();
  private readonly strategyDetailCache = new Map<string, StrategyExplorerStrategyPayload>();
  private readonly strategyDetailPending = new Map<string, Promise<StrategyExplorerStrategyPayload>>();
  private readonly threadTimelineCache = new Map<string, ThreadTimelinePayload>();
  private readonly threadTimelinePending = new Map<string, Promise<ThreadTimelinePayload>>();
  private running = false;

  private queueStrategyRankingPresetWarmup(
    input: {
      profileId: string;
      csvPath: string;
      initialCapital: number;
      executionModel: string;
      priceBasis: string;
      overridesKey?: string;
    },
    slicePresets: Array<{ preset_id: string; start: string; end: string }>,
    dataHash: string,
  ): void {
    void this.ensureStrategyRankingPresets(input, slicePresets, dataHash).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Preset ranking warmup failed for ${input.profileId}: ${message}`);
    });
  }

  async createJob(input: BacktestJobInput): Promise<DashboardJobRecord> {
    const { profile, profilePayload, csvPath, initialCapital } = await resolveProfileContext(input);
    const dataStatus = await getDataStatus(csvPath, profile.symbol);
    const job: DashboardJobRecord = {
      jobId: newJobId(),
      kind: "BACKTEST",
      status: "QUEUED",
      profileId: input.profileId,
      symbol: profile.symbol,
      csvPath,
      initialCapital,
      configHash: profilePayload.configHash,
      dataHash: dataStatus.data_hash,
      requestedAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      progress: 0,
      runId: null,
      artifactId: null,
      error: null,
      overrides: input.overrides,
    };
    await saveJob(job);
    this.queuedJobIds.add(job.jobId);
    void this.drainQueue();
    return job;
  }

  async createSweepJob(input: SweepJobInput): Promise<DashboardJobRecord> {
    const { profile, profilePayload, csvPath, initialCapital } = await resolveProfileContext(input);
    const executionModel = input.executionModel ?? defaultSweepExecutionModel();
    const priceBasis = input.priceBasis ?? defaultSweepPriceBasis(profile);
    const sweepId = input.sweepId ?? DEFAULT_SWEEP_ID;
    const [dataStatus, store] = await Promise.all([getDataStatus(csvPath, profile.symbol), getResearchStore()]);
    const artifactKey = makeSweepArtifactKey({
      profileId: input.profileId,
      csvPath,
      dataHash: dataStatus.data_hash,
      initialCapital,
      executionModel,
      priceBasis,
      sweepId,
    });
    const cached = await store.findByKey<ParameterSweepPayload>(artifactKey);
    const reusableCached = isReusableResearchArtifact(cached);
    const now = new Date().toISOString();
    const job: DashboardJobRecord = {
      jobId: newJobId(),
      kind: "BACKTEST_SWEEP",
      status: reusableCached ? "COMPLETED" : "QUEUED",
      profileId: input.profileId,
      symbol: profile.symbol,
      csvPath,
      initialCapital,
      configHash: profilePayload.configHash,
      dataHash: dataStatus.data_hash,
      requestedAt: now,
      startedAt: reusableCached ? now : null,
      finishedAt: reusableCached ? now : null,
      progress: reusableCached ? 100 : 0,
      runId: null,
      artifactId: reusableCached ? cached.artifactId : null,
      error: null,
      sweepId,
      executionModel,
      priceBasis,
    };
    await saveJob(job);
    if (!reusableCached) {
      this.queuedJobIds.add(job.jobId);
      void this.drainQueue();
    }
    return job;
  }

  async strategyExplorer(input: StrategyExplorerInput): Promise<StrategyExplorerPayload> {
    const { profile, csvPath, initialCapital } = await resolveProfileContext(input);
    const catalogId = input.catalogId ?? DEFAULT_STRATEGY_CATALOG_ID;
    const executionModel = input.executionModel ?? defaultStrategyExecutionModel(profile);
    const priceBasis = input.priceBasis ?? defaultStrategyPriceBasis(profile);
    const overridesKey = stableOverrideKey(input.overrides);
    const [dataStatus, store] = await Promise.all([getDataStatus(csvPath, profile.symbol), getResearchStore()]);
    const artifactKey = makeStrategyArtifactKey({
      profileId: input.profileId,
      csvPath,
      dataHash: dataStatus.data_hash,
      initialCapital,
      executionModel,
      priceBasis,
      catalogId,
      overridesKey,
    });
    const cached = await store.findByKey<StrategyExplorerPayload>(artifactKey);
    if (isReusableResearchArtifact(cached)) {
      this.queueStrategyRankingPresetWarmup(
        {
          profileId: input.profileId,
          csvPath,
          initialCapital,
          executionModel,
          priceBasis,
          overridesKey,
        },
        cached.payload.meta.slice_presets,
        dataStatus.data_hash,
      );
      return cached.payload;
    }
    const payload = await runCliJson<StrategyExplorerPayload>([
      "backtest",
      "strategy-explorer",
      "--profile",
      profile.profilePath,
      "--csv",
      csvPath,
      "--symbol",
      profile.symbol,
      "--initial-capital",
      String(initialCapital),
      ...buildResearchArgs({ catalogId, executionModel, priceBasis }),
      ...buildOverrideArgs(input.overrides, { includePriceBasis: false }),
    ]);
    await saveStrategyArtifact(payload, {
      artifactKey,
      profileId: input.profileId,
      symbol: profile.symbol,
      csvPath,
    });
    this.queueStrategyRankingPresetWarmup(
      {
        profileId: input.profileId,
        csvPath,
        initialCapital,
        executionModel,
        priceBasis,
        overridesKey,
      },
      payload.meta.slice_presets,
      dataStatus.data_hash,
    );
    return payload;
  }

  async strategyRanking(input: StrategyRankingInput): Promise<StrategyRankingPayload> {
    const { profile, csvPath, initialCapital } = await resolveProfileContext(input);
    const executionModel = input.executionModel ?? defaultStrategyExecutionModel(profile);
    const priceBasis = input.priceBasis ?? defaultStrategyPriceBasis(profile);
    const limit = input.limit ?? 0;
    const overridesKey = stableOverrideKey(input.overrides);
    const dataStatus = await getDataStatus(csvPath, profile.symbol);
    const cacheKey = makeStrategyRankingCacheKey({
      profileId: input.profileId,
      csvPath,
      dataHash: dataStatus.data_hash,
      initialCapital,
      executionModel,
      priceBasis,
      sliceStart: input.sliceStart,
      sliceEnd: input.sliceEnd,
      overridesKey,
    });
    const cached = this.strategyRankingCache.get(cacheKey);
    if (cached && isCompleteStrategyRankingPayload(cached)) {
      return applyStrategyRankingLimit(cached, limit);
    }
    const [store, pending] = await Promise.all([getResearchStore(), Promise.resolve(this.strategyRankingPending.get(cacheKey))]);
    if (pending) {
      return applyStrategyRankingLimit(await pending, limit);
    }
    const stored = await store.findByKey<StrategyRankingPayload>(cacheKey);
    if (isReusableResearchArtifact(stored) && isCompleteStrategyRankingPayload(stored.payload)) {
      this.strategyRankingCache.set(cacheKey, stored.payload);
      return applyStrategyRankingLimit(stored.payload, limit);
    }
    const loader = (async () => {
    const fullPeriod =
      (!input.sliceStart || input.sliceStart === dataStatus.start) &&
      (!input.sliceEnd || input.sliceEnd === dataStatus.end);
    if (fullPeriod && !overridesKey) {
      const latestSweep = await this.getLatestSweep({
        profileId: input.profileId,
        csvPath,
        initialCapital,
        executionModel,
        priceBasis,
        sweepId: DEFAULT_SWEEP_ID,
      });
      if (latestSweep?.payload) {
        return {
          meta: {
            symbol: latestSweep.payload.meta.symbol,
            initial_capital: latestSweep.payload.meta.initial_capital,
            price_basis: latestSweep.payload.meta.price_basis,
            execution_model: latestSweep.payload.meta.execution_model,
            period_start: latestSweep.payload.meta.period_start,
            period_end: latestSweep.payload.meta.period_end,
            data_hash: latestSweep.payload.meta.data_hash,
            code_commit: latestSweep.payload.meta.code_commit,
            ranking_basis: STRATEGY_RANKING_BASIS,
            segment_presets: latestSweep.payload.meta.segment_presets,
            combo_count: latestSweep.payload.meta.combo_count,
          },
          rows: latestSweep.payload.rows
            .map((row) => ({
              combo_key: row.combo_key,
              strategy_id: row.combo_key,
              label: row.combo_key,
              display_params:
                `T${row.params.thread_count} / ${row.params.stop_sessions}S / `
                + `BUY ${row.params.buy_pct >= 0 ? "+" : ""}${row.params.buy_pct}% / `
                + `SELL ${row.params.sell_pct >= 0 ? "+" : ""}${row.params.sell_pct}%`,
              thread_count: row.params.thread_count,
              stop_sessions: row.params.stop_sessions,
              buy_pct: row.params.buy_pct,
              sell_pct: row.params.sell_pct,
              full_return_pct: row.metrics.full_return_pct,
              cagr_pct: row.metrics.cagr_pct,
              max_drawdown_pct: row.metrics.max_drawdown_pct,
              trade_count: row.metrics.trade_count,
              rank: 0,
            }))
            .sort(compareStrategyRankingRows)
            .map((row, index) => ({ ...row, rank: index + 1 })),
        };
      }
    }
      return requestStrategyRankingFromDaemon({
        profilePath: profile.profilePath,
        csvPath,
        symbol: profile.symbol,
        initialCapital,
        executionModel,
        priceBasis,
        sliceStart: input.sliceStart,
        sliceEnd: input.sliceEnd,
        limit: 0,
        overrides: input.overrides,
      });
    })();
    this.strategyRankingPending.set(cacheKey, loader);
    try {
      const payload = await loader;
      this.strategyRankingCache.set(cacheKey, payload);
      await saveStrategyRankingArtifact(payload, {
        artifactKey: cacheKey,
        profileId: input.profileId,
        symbol: profile.symbol,
        csvPath,
        sliceStart: input.sliceStart,
        sliceEnd: input.sliceEnd,
      });
      return applyStrategyRankingLimit(payload, limit);
    } finally {
      this.strategyRankingPending.delete(cacheKey);
    }
  }

  async strategyDetail(input: StrategyDetailInput): Promise<StrategyExplorerStrategyPayload> {
    const { profile, csvPath, initialCapital } = await resolveProfileContext(input);
    const executionModel = input.executionModel ?? defaultStrategyExecutionModel(profile);
    const priceBasis = input.priceBasis ?? defaultStrategyPriceBasis(profile);
    const overridesKey = stableOverrideKey(input.overrides);
    const dataStatus = await getDataStatus(csvPath, profile.symbol);
    const cacheKey = makeStrategyDetailCacheKey({
      profileId: input.profileId,
      csvPath,
      dataHash: dataStatus.data_hash,
      initialCapital,
      executionModel,
      priceBasis,
      strategyId: input.strategyId,
      sliceStart: input.sliceStart,
      sliceEnd: input.sliceEnd,
      overridesKey,
    });
    const cached = this.strategyDetailCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const pending = this.strategyDetailPending.get(cacheKey);
    if (pending) {
      return pending;
    }
    const loader = runCliJson<StrategyExplorerStrategyPayload>([
      "backtest",
      "strategy-detail",
      "--profile",
      profile.profilePath,
      "--csv",
      csvPath,
      "--symbol",
      profile.symbol,
      "--initial-capital",
      String(initialCapital),
      "--strategy-id",
      input.strategyId,
      ...(input.sliceStart ? ["--slice-start", input.sliceStart] : []),
      ...(input.sliceEnd ? ["--slice-end", input.sliceEnd] : []),
      "--execution-model",
      executionModel,
      "--price-basis",
      priceBasis,
      ...buildOverrideArgs(input.overrides, { includeThreadCount: false, includeStopSessions: false, includePriceBasis: false }),
    ]);
    this.strategyDetailPending.set(cacheKey, loader);
    try {
      const payload = await loader;
      this.strategyDetailCache.set(cacheKey, payload);
      return payload;
    } finally {
      this.strategyDetailPending.delete(cacheKey);
    }
  }

  async officialExplorer(input: OfficialExplorerInput): Promise<OfficialExplorerPayload> {
    const { profile, csvPath, initialCapital } = await resolveProfileContext(input);
    return runCliJson<OfficialExplorerPayload>([
      "backtest",
      "official-explorer",
      "--profile",
      profile.profilePath,
      "--csv",
      csvPath,
      "--symbol",
      profile.symbol,
      "--initial-capital",
      String(initialCapital),
    ]);
  }

  async threadTimeline(input: ThreadTimelineInput): Promise<ThreadTimelinePayload> {
    const { profile, csvPath, initialCapital } = await resolveProfileContext(input);
    const executionModel = input.executionModel ?? defaultStrategyExecutionModel(profile);
    const priceBasis = input.priceBasis ?? defaultStrategyPriceBasis(profile);
    const overridesKey = stableOverrideKey(input.overrides);
    const dataStatus = await getDataStatus(csvPath, profile.symbol);
    const cacheKey = makeThreadTimelineCacheKey({
      profileId: input.profileId,
      csvPath,
      dataHash: dataStatus.data_hash,
      initialCapital,
      executionModel,
      priceBasis,
      strategyId: input.strategyId,
      sliceStart: input.sliceStart,
      sliceEnd: input.sliceEnd,
      overridesKey,
    });
    const cached = this.threadTimelineCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const pending = this.threadTimelinePending.get(cacheKey);
    if (pending) {
      return pending;
    }
    const loader = runCliJson<ThreadTimelinePayload>([
      "backtest",
      "thread-timeline",
      "--profile",
      profile.profilePath,
      "--csv",
      csvPath,
      "--symbol",
      profile.symbol,
      "--strategy-id",
      input.strategyId,
      ...(input.sliceStart ? ["--slice-start", input.sliceStart] : []),
      ...(input.sliceEnd ? ["--slice-end", input.sliceEnd] : []),
      "--initial-capital",
      String(initialCapital),
      "--execution-model",
      executionModel,
      "--price-basis",
      priceBasis,
      ...buildOverrideArgs(input.overrides, { includeThreadCount: false, includeStopSessions: false, includePriceBasis: false }),
    ]);
    this.threadTimelinePending.set(cacheKey, loader);
    try {
      const payload = await loader;
      this.threadTimelineCache.set(cacheKey, payload);
      return payload;
    } finally {
      this.threadTimelinePending.delete(cacheKey);
    }
  }

  async getLatestSweep(input: SweepJobInput): Promise<ResearchArtifactRecord<ParameterSweepPayload> | null> {
    const { profile, csvPath, initialCapital } = await resolveProfileContext(input);
    const executionModel = input.executionModel ?? defaultSweepExecutionModel();
    const priceBasis = input.priceBasis ?? defaultSweepPriceBasis(profile);
    const sweepId = input.sweepId ?? DEFAULT_SWEEP_ID;
    const [dataStatus, store] = await Promise.all([getDataStatus(csvPath, profile.symbol), getResearchStore()]);
    const artifactKey = makeSweepArtifactKey({
      profileId: input.profileId,
      csvPath,
      dataHash: dataStatus.data_hash,
      initialCapital,
      executionModel,
      priceBasis,
      sweepId,
    });
    const artifact = await store.findByKey<ParameterSweepPayload>(artifactKey);
    if (!isReusableResearchArtifact(artifact)) {
      return null;
    }
    return {
      ...artifact,
      payload: normalizeSweepPayload(artifact.payload),
    };
  }

  async warmStrategyPresetRankings(input: StrategyExplorerInput): Promise<void> {
    const { profile, csvPath, initialCapital } = await resolveProfileContext(input);
    const executionModel = input.executionModel ?? defaultStrategyExecutionModel(profile);
    const priceBasis = input.priceBasis ?? defaultStrategyPriceBasis(profile);
    const overridesKey = stableOverrideKey(input.overrides);
    const payload = await this.strategyExplorer({
      profileId: input.profileId,
      csvPath,
      initialCapital,
      catalogId: input.catalogId,
      executionModel,
      priceBasis,
      overrides: input.overrides,
    });
    const dataStatus = await getDataStatus(csvPath, profile.symbol);
    await this.ensureStrategyRankingPresets(
      {
        profileId: input.profileId,
        csvPath,
        initialCapital,
        executionModel,
        priceBasis,
        overridesKey,
      },
      payload.meta.slice_presets,
      dataStatus.data_hash,
    );
  }

  async warmDefaultStrategyPresetRankings(): Promise<void> {
    const workspaces = listWorkspaceDefinitions();
    await runWithConcurrency(
      workspaces.map((workspace) => async () => {
        await this.warmStrategyPresetRankings({
          profileId: workspace.defaultProfileId,
          csvPath: workspace.csvPath,
          executionModel: workspace.defaultStrategyExecutionModel,
          priceBasis: workspace.defaultStrategyPriceBasis,
        });
      }),
      1,
    );
  }

  private ensureStrategyRankingPresets(
    input: {
      profileId: string;
      csvPath: string;
      initialCapital: number;
      executionModel: string;
      priceBasis: string;
      overridesKey?: string;
    },
    slicePresets: Array<{ preset_id: string; start: string; end: string }>,
    dataHash: string,
  ): Promise<void> {
    const warmupKey = makeStrategyPresetWarmupKey({
      profileId: input.profileId,
      csvPath: input.csvPath,
      dataHash,
      initialCapital: input.initialCapital,
      executionModel: input.executionModel,
      priceBasis: input.priceBasis,
      overridesKey: input.overridesKey,
    });
    const pending = this.strategyPresetWarmupPending.get(warmupKey);
    if (pending) {
      return pending;
    }
    const tasks = slicePresets.map((preset) => async () => {
      await this.strategyRanking({
        profileId: input.profileId,
        csvPath: input.csvPath,
        initialCapital: input.initialCapital,
        executionModel: input.executionModel,
        priceBasis: input.priceBasis,
        sliceStart: preset.start,
        sliceEnd: preset.end,
        limit: 0,
      });
    });
    const runner = runWithConcurrency(tasks, 1).then(() => undefined).finally(() => {
      this.strategyPresetWarmupPending.delete(warmupKey);
    });
    this.strategyPresetWarmupPending.set(warmupKey, runner);
    return runner;
  }

  async getSweepArtifact(artifactId: string): Promise<ResearchArtifactRecord<ParameterSweepPayload>> {
    const store = await getResearchStore();
    const artifact = await store.loadArtifact<ParameterSweepPayload>(artifactId);
    if (!artifact) {
      throw new HttpError(404, `Unknown sweep artifactId: ${artifactId}`);
    }
    return {
      ...artifact,
      payload: normalizeSweepPayload(artifact.payload),
    };
  }

  async getJob(jobId: string): Promise<DashboardJobRecord> {
    const job = await loadJob(jobId);
    if (!job) {
      throw new HttpError(404, `Unknown jobId: ${jobId}`);
    }
    return job;
  }

  async getRun(runId: string): Promise<PersistedRunArtifact> {
    const run = await loadRunArtifact(runId);
    if (!run) {
      throw new HttpError(404, `Unknown runId: ${runId}`);
    }
    return run;
  }

  async getRunTradesCsv(runId: string): Promise<string> {
    const artifact = await this.getRun(runId);
    return tradesToCsv(artifact.payload);
  }

  async getOverview(): Promise<{
    jobs: DashboardJobRecord[];
    runs: Array<Record<string, unknown>>;
    latestRun: PersistedRunArtifact | null;
  }> {
    const [jobs, runs] = await Promise.all([listJobs(12), listRunArtifacts(6)]);
    return {
      jobs,
      runs: runs.map((artifact) => summarizeArtifact(artifact)),
      latestRun: runs[0] ?? null,
    };
  }

  async compare(input: CompareInput): Promise<{
    profileId: string;
    csvPath: string;
    requestedAt: string;
    configHash: string;
    dataHash: string;
    threadCounts: number[];
    stopSessions: number[];
    cells: GridCellPayload[];
  }> {
    const { profile, profilePayload, csvPath, initialCapital } = await resolveProfileContext(input);
    const [dataStatus, cells] = await Promise.all([
      getDataStatus(csvPath, profile.symbol),
      runCliJson<GridCellPayload[]>([
        "backtest",
        "grid",
        "--profile",
        profile.profilePath,
        "--csv",
        csvPath,
        "--symbol",
        profile.symbol,
        "--threads",
        input.threads.join(","),
        "--stops",
        input.stops.join(","),
        "--initial-capital",
        String(initialCapital),
        ...buildOverrideArgs(input.overrides, { includeThreadCount: false, includeStopSessions: false }),
      ]),
    ]);
    return {
      profileId: input.profileId,
      csvPath,
      requestedAt: new Date().toISOString(),
      configHash: profilePayload.configHash,
      dataHash: dataStatus.data_hash,
      threadCounts: input.threads,
      stopSessions: input.stops,
      cells,
    };
  }

  async mentorMatrix(input: MentorMatrixInput): Promise<MentorMatrixPayload> {
    const { profile, profilePayload, csvPath, initialCapital } = await resolveProfileContext(input);
    const dataStatus = await getDataStatus(csvPath, profile.symbol);
    const cacheKey = [
      "mentor-matrix",
      input.profileId,
      profilePayload.configHash,
      dataStatus.data_hash,
      input.threads.join(","),
      input.stops.join(","),
    ].join(":");
    const cached = await loadMentorMatrixArtifact<MentorMatrixPayload>(cacheKey);
    if (cached) {
      return cached;
    }
    const payload = await runCliJson<MentorMatrixPayload>([
      "backtest",
      "mentor-matrix",
      "--profile",
      profile.profilePath,
      "--csv",
      csvPath,
      "--symbol",
      profile.symbol,
      "--threads",
      input.threads.join(","),
      "--stops",
      input.stops.join(","),
      "--initial-capital",
      String(initialCapital),
      ...buildOverrideArgs(input.overrides, { includeThreadCount: false, includeStopSessions: false }),
    ]);
    await saveMentorMatrixArtifact(cacheKey, payload);
    return payload;
  }

  async officialMatrix(input: OfficialMatrixInput): Promise<OfficialMatrixPayload> {
    const { profile, profilePayload, csvPath, initialCapital } = await resolveProfileContext(input);
    const dataStatus = await getDataStatus(csvPath, profile.symbol);
    const cacheKey = [
      "official-matrix",
      input.profileId,
      profilePayload.configHash,
      dataStatus.data_hash,
      input.threads.join(","),
      input.stops.join(","),
    ].join(":");
    const cached = await loadOfficialMatrixArtifact<OfficialMatrixPayload>(cacheKey);
    if (cached) {
      return cached;
    }
    const payload = await runCliJson<OfficialMatrixPayload>([
      "backtest",
      "official-matrix",
      "--profile",
      profile.profilePath,
      "--csv",
      csvPath,
      "--symbol",
      profile.symbol,
      "--threads",
      input.threads.join(","),
      "--stops",
      input.stops.join(","),
      "--initial-capital",
      String(initialCapital),
      ...buildOverrideArgs(input.overrides, { includeThreadCount: false, includeStopSessions: false }),
    ]);
    await saveOfficialMatrixArtifact(cacheKey, payload);
    return payload;
  }

  async riskReport(input: {
    profileId: string;
    csvPath?: string;
    initialCapital?: number;
    overrides?: BacktestOverrides;
  }): Promise<BacktestRiskPayload> {
    const { profile, csvPath, initialCapital } = await resolveProfileContext(input);
    return runCliJson<BacktestRiskPayload>([
      "backtest",
      "risk-report",
      "--profile",
      profile.profilePath,
      "--csv",
      csvPath,
      "--symbol",
      profile.symbol,
      "--initial-capital",
      String(initialCapital),
      ...buildOverrideArgs(input.overrides),
    ]);
  }

  private async drainQueue(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      while (this.queuedJobIds.size > 0) {
        const [jobId] = this.queuedJobIds;
        this.queuedJobIds.delete(jobId);
        await this.executeJob(jobId);
      }
    } finally {
      this.running = false;
      if (this.queuedJobIds.size > 0) {
        void this.drainQueue();
      }
    }
  }

  private async executeJob(jobId: string): Promise<void> {
    const job = await loadJob(jobId);
    if (!job || job.status !== "QUEUED") {
      return;
    }
    if (job.kind === "BACKTEST_SWEEP") {
      await this.executeSweepJob(job);
      return;
    }
    await this.executeBacktestJob(job);
  }

  private async executeBacktestJob(job: DashboardJobRecord): Promise<void> {
    const profile = getProfileDefinition(job.profileId);
    if (!profile) {
      job.status = "FAILED";
      job.error = `Unknown profileId: ${job.profileId}`;
      job.finishedAt = new Date().toISOString();
      job.progress = 100;
      await saveJob(job);
      return;
    }
    job.status = "RUNNING";
    job.startedAt = new Date().toISOString();
    job.progress = 15;
    await saveJob(job);

    try {
      const payload = await runCliJson<BacktestDetailPayload>([
        "backtest",
        "detail",
        "--profile",
        profile.profilePath,
        "--csv",
        job.csvPath,
        "--symbol",
        job.symbol,
        "--initial-capital",
        String(job.initialCapital),
        ...buildOverrideArgs(job.overrides),
      ]);
      const artifact: PersistedRunArtifact = {
        runId: payload.run_id,
        profileId: job.profileId,
        symbol: job.symbol,
        csvPath: job.csvPath,
        createdAt: new Date().toISOString(),
        dataHash: payload.data_hash,
        configHash: payload.config_hash,
        payload,
      };
      await saveRunArtifact(artifact);
      job.status = "COMPLETED";
      job.progress = 100;
      job.finishedAt = new Date().toISOString();
      job.runId = payload.run_id;
      job.error = null;
      await saveJob(job);
    } catch (error) {
      job.status = "FAILED";
      job.progress = 100;
      job.finishedAt = new Date().toISOString();
      job.error = error instanceof Error ? error.message : "Unknown backtest failure";
      await saveJob(job);
    }
  }

  private async executeSweepJob(job: DashboardJobRecord): Promise<void> {
    const profile = getProfileDefinition(job.profileId);
    if (!profile) {
      job.status = "FAILED";
      job.error = `Unknown profileId: ${job.profileId}`;
      job.finishedAt = new Date().toISOString();
      job.progress = 100;
      await saveJob(job);
      return;
    }
    const sweepId = job.sweepId ?? DEFAULT_SWEEP_ID;
    const executionModel = job.executionModel ?? defaultSweepExecutionModel();
    const priceBasis = job.priceBasis ?? defaultSweepPriceBasis(profile);
    job.status = "RUNNING";
    job.startedAt = new Date().toISOString();
    job.progress = 10;
    await saveJob(job);

    try {
      const dataStatus = await getDataStatus(job.csvPath, profile.symbol);
      const artifactKey = makeSweepArtifactKey({
        profileId: job.profileId,
        csvPath: job.csvPath,
        dataHash: dataStatus.data_hash,
        initialCapital: job.initialCapital,
        executionModel,
        priceBasis,
        sweepId,
      });
      const payload = await runCliJson<ParameterSweepPayload>([
        "backtest",
        "parameter-sweep",
        "--profile",
        profile.profilePath,
        "--csv",
        job.csvPath,
        "--symbol",
        job.symbol,
        "--initial-capital",
        String(job.initialCapital),
        ...buildResearchArgs({ sweepId, executionModel, priceBasis }),
      ]);
      const artifact = await saveSweepArtifact(payload, {
        artifactKey,
        profileId: job.profileId,
        symbol: job.symbol,
        csvPath: job.csvPath,
      });
      job.status = "COMPLETED";
      job.progress = 100;
      job.finishedAt = new Date().toISOString();
      job.artifactId = artifact.artifactId;
      job.error = null;
      await saveJob(job);
    } catch (error) {
      job.status = "FAILED";
      job.progress = 100;
      job.finishedAt = new Date().toISOString();
      job.error = error instanceof Error ? error.message : "Unknown sweep failure";
      await saveJob(job);
    }
  }
}
