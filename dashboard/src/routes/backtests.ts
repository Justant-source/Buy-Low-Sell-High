import { Router } from "express";

import { asyncHandler, HttpError, parseCsvList, parseNumber, requireString } from "../lib/http.js";
import { defaultProfileId } from "../lib/profiles.js";
import type { BacktestService } from "../lib/backtest-service.js";
import type { BacktestOverrides } from "../lib/types.js";

function parseOptionalNumberField(
  value: unknown,
  fieldName: string,
  { integer = false, min }: { integer?: boolean; min: number },
): number | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  const parsed = parseNumber(value, Number.NaN);
  if (!Number.isFinite(parsed)) {
    throw new HttpError(400, `Invalid ${fieldName}`);
  }
  if (integer && !Number.isInteger(parsed)) {
    throw new HttpError(400, `${fieldName} must be an integer`);
  }
  if (parsed < min) {
    throw new HttpError(400, `${fieldName} must be >= ${min}`);
  }
  return parsed;
}

function parseOptionalSignedNumberField(
  value: unknown,
  fieldName: string,
  { integer = false }: { integer?: boolean } = {},
): number | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  const parsed = parseNumber(value, Number.NaN);
  if (!Number.isFinite(parsed)) {
    throw new HttpError(400, `Invalid ${fieldName}`);
  }
  if (integer && !Number.isInteger(parsed)) {
    throw new HttpError(400, `${fieldName} must be an integer`);
  }
  return parsed;
}

function parseOptionalBooleanField(value: unknown, fieldName: string): boolean | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  throw new HttpError(400, `Invalid ${fieldName}`);
}

function parseOptionalEnumField<T extends string>(value: unknown, fieldName: string, allowed: readonly T[]): T | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new HttpError(400, `Invalid ${fieldName}`);
  }
  return value as T;
}

function parseOverrides(
  source: Record<string, unknown>,
  options: { includePriceBasis?: boolean } = {},
): BacktestOverrides | undefined {
  const overrides: BacktestOverrides = {};
  const includePriceBasis = options.includePriceBasis ?? true;
  const threadCount = parseOptionalNumberField(source.threadCount, "threadCount", { integer: true, min: 1 });
  const stopSessions = parseOptionalNumberField(source.stopSessions, "stopSessions", { integer: true, min: 1 });
  const takeProfitPct = parseOptionalNumberField(source.takeProfitPct, "takeProfitPct", { min: 0 });
  const entryDropPct = parseOptionalNumberField(source.entryDropPct, "entryDropPct", { min: 0 });
  const stopLossPct = parseOptionalNumberField(source.stopLossPct, "stopLossPct", { min: 0 });
  const maxEntriesPerSession = parseOptionalNumberField(source.maxEntriesPerSession, "maxEntriesPerSession", {
    integer: true,
    min: 1,
  });
  const regimeEnabled = parseOptionalBooleanField(source.regimeEnabled, "regimeEnabled");
  const regimeSymbol = typeof source.regimeSymbol === "string" && source.regimeSymbol.trim() !== "" ? source.regimeSymbol.trim() : undefined;
  const regimeRsiPeriodWeeks = parseOptionalNumberField(source.regimeRsiPeriodWeeks, "regimeRsiPeriodWeeks", {
    integer: true,
    min: 1,
  });
  const regimeBearHighThreshold = parseOptionalSignedNumberField(source.regimeBearHighThreshold, "regimeBearHighThreshold");
  const regimeBearMidLowThreshold = parseOptionalSignedNumberField(source.regimeBearMidLowThreshold, "regimeBearMidLowThreshold");
  const regimeBearMidHighThreshold = parseOptionalSignedNumberField(source.regimeBearMidHighThreshold, "regimeBearMidHighThreshold");
  const regimeBullLowThreshold = parseOptionalSignedNumberField(source.regimeBullLowThreshold, "regimeBullLowThreshold");
  const regimeBullMidLowThreshold = parseOptionalSignedNumberField(source.regimeBullMidLowThreshold, "regimeBullMidLowThreshold");
  const regimeBullMidHighThreshold = parseOptionalSignedNumberField(source.regimeBullMidHighThreshold, "regimeBullMidHighThreshold");
  const regimeBaseStopSessions = parseOptionalNumberField(source.regimeBaseStopSessions, "regimeBaseStopSessions", {
    integer: true,
    min: 1,
  });
  const regimeBaseBuyPct = parseOptionalSignedNumberField(source.regimeBaseBuyPct, "regimeBaseBuyPct");
  const regimeBaseSellPct = parseOptionalSignedNumberField(source.regimeBaseSellPct, "regimeBaseSellPct");
  const regimeBullStopSessions = parseOptionalNumberField(source.regimeBullStopSessions, "regimeBullStopSessions", {
    integer: true,
    min: 1,
  });
  const regimeBullBuyPct = parseOptionalSignedNumberField(source.regimeBullBuyPct, "regimeBullBuyPct");
  const regimeBullSellPct = parseOptionalSignedNumberField(source.regimeBullSellPct, "regimeBullSellPct");
  const regimeBearStopSessions = parseOptionalNumberField(source.regimeBearStopSessions, "regimeBearStopSessions", {
    integer: true,
    min: 1,
  });
  const regimeBearBuyPct = parseOptionalSignedNumberField(source.regimeBearBuyPct, "regimeBearBuyPct");
  const regimeBearSellPct = parseOptionalSignedNumberField(source.regimeBearSellPct, "regimeBearSellPct");
  const takeProfitOperator = parseOptionalEnumField(source.takeProfitOperator, "takeProfitOperator", ["gt", "gte"]);
  const sizingMode = parseOptionalEnumField(source.sizingMode, "sizingMode", [
    "fixed_principal",
    "thread_compound",
    "portfolio_rebalance_compound",
  ]);
  const priceBasis = includePriceBasis
    ? parseOptionalEnumField(source.priceBasis, "priceBasis", [
      "adjusted_close",
      "raw_close_with_actions",
    ])
    : undefined;
  if (threadCount != null) overrides.threadCount = threadCount;
  if (stopSessions != null) overrides.stopSessions = stopSessions;
  if (takeProfitPct != null) overrides.takeProfitPct = takeProfitPct;
  if (takeProfitOperator) overrides.takeProfitOperator = takeProfitOperator;
  if (entryDropPct != null) overrides.entryDropPct = entryDropPct;
  if (stopLossPct != null) overrides.stopLossPct = stopLossPct;
  if (maxEntriesPerSession != null) overrides.maxEntriesPerSession = maxEntriesPerSession;
  if (sizingMode) overrides.sizingMode = sizingMode;
  if (priceBasis) overrides.priceBasis = priceBasis;
  if (regimeEnabled != null) overrides.regimeEnabled = regimeEnabled;
  if (regimeSymbol) overrides.regimeSymbol = regimeSymbol;
  if (regimeRsiPeriodWeeks != null) overrides.regimeRsiPeriodWeeks = regimeRsiPeriodWeeks;
  if (regimeBearHighThreshold != null) overrides.regimeBearHighThreshold = regimeBearHighThreshold;
  if (regimeBearMidLowThreshold != null) overrides.regimeBearMidLowThreshold = regimeBearMidLowThreshold;
  if (regimeBearMidHighThreshold != null) overrides.regimeBearMidHighThreshold = regimeBearMidHighThreshold;
  if (regimeBullLowThreshold != null) overrides.regimeBullLowThreshold = regimeBullLowThreshold;
  if (regimeBullMidLowThreshold != null) overrides.regimeBullMidLowThreshold = regimeBullMidLowThreshold;
  if (regimeBullMidHighThreshold != null) overrides.regimeBullMidHighThreshold = regimeBullMidHighThreshold;
  if (regimeBaseStopSessions != null) overrides.regimeBaseStopSessions = regimeBaseStopSessions;
  if (regimeBaseBuyPct != null) overrides.regimeBaseBuyPct = regimeBaseBuyPct;
  if (regimeBaseSellPct != null) overrides.regimeBaseSellPct = regimeBaseSellPct;
  if (regimeBullStopSessions != null) overrides.regimeBullStopSessions = regimeBullStopSessions;
  if (regimeBullBuyPct != null) overrides.regimeBullBuyPct = regimeBullBuyPct;
  if (regimeBullSellPct != null) overrides.regimeBullSellPct = regimeBullSellPct;
  if (regimeBearStopSessions != null) overrides.regimeBearStopSessions = regimeBearStopSessions;
  if (regimeBearBuyPct != null) overrides.regimeBearBuyPct = regimeBearBuyPct;
  if (regimeBearSellPct != null) overrides.regimeBearSellPct = regimeBearSellPct;
  return Object.keys(overrides).length ? overrides : undefined;
}

export function createBacktestsRouter(backtestService: BacktestService): Router {
  const router = Router();

  router.get(
    "/strategy-explorer",
    asyncHandler(async (req, res) => {
      const profileId = typeof req.query.profileId === "string" ? req.query.profileId : defaultProfileId;
      const csvPath = typeof req.query.csvPath === "string" && req.query.csvPath.trim() !== "" ? req.query.csvPath : undefined;
      const initialCapital = parseNumber(req.query.initialCapital, 10000);
      const executionModel = parseOptionalEnumField(req.query.executionModel, "executionModel", [
        "ideal_same_close",
        "next_open",
        "next_close",
      ]);
      const priceBasis = parseOptionalEnumField(req.query.priceBasis, "priceBasis", [
        "adjusted_close",
        "raw_close_with_actions",
      ]);
      const overrides = parseOverrides(req.query as Record<string, unknown>, { includePriceBasis: false });
      res.json(
        await backtestService.strategyExplorer({
          profileId,
          csvPath,
          initialCapital,
          executionModel,
          priceBasis,
          overrides,
        }),
      );
    }),
  );

  router.get(
    "/strategy-ranking",
    asyncHandler(async (req, res) => {
      const profileId = typeof req.query.profileId === "string" ? req.query.profileId : defaultProfileId;
      const csvPath = typeof req.query.csvPath === "string" && req.query.csvPath.trim() !== "" ? req.query.csvPath : undefined;
      const initialCapital = parseNumber(req.query.initialCapital, 10000);
      const executionModel = parseOptionalEnumField(req.query.executionModel, "executionModel", [
        "ideal_same_close",
        "next_open",
        "next_close",
      ]);
      const priceBasis = parseOptionalEnumField(req.query.priceBasis, "priceBasis", [
        "adjusted_close",
        "raw_close_with_actions",
      ]);
      const limit = parseOptionalNumberField(req.query.limit, "limit", { integer: true, min: 0 }) ?? 0;
      const sliceStart = typeof req.query.sliceStart === "string" && req.query.sliceStart.trim() !== "" ? req.query.sliceStart : undefined;
      const sliceEnd = typeof req.query.sliceEnd === "string" && req.query.sliceEnd.trim() !== "" ? req.query.sliceEnd : undefined;
      const overrides = parseOverrides(req.query as Record<string, unknown>, { includePriceBasis: false });
      res.json(
        await backtestService.strategyRanking({
          profileId,
          csvPath,
          initialCapital,
          executionModel,
          priceBasis,
          sliceStart,
          sliceEnd,
          limit,
          overrides,
        }),
      );
    }),
  );

  router.get(
    "/strategy-detail",
    asyncHandler(async (req, res) => {
      const profileId = typeof req.query.profileId === "string" ? req.query.profileId : defaultProfileId;
      const csvPath = typeof req.query.csvPath === "string" && req.query.csvPath.trim() !== "" ? req.query.csvPath : undefined;
      const initialCapital = parseNumber(req.query.initialCapital, 10000);
      const strategyId = requireString(req.query.strategyId, "strategyId");
      const sliceStart = typeof req.query.sliceStart === "string" && req.query.sliceStart.trim() !== "" ? req.query.sliceStart : undefined;
      const sliceEnd = typeof req.query.sliceEnd === "string" && req.query.sliceEnd.trim() !== "" ? req.query.sliceEnd : undefined;
      const executionModel = parseOptionalEnumField(req.query.executionModel, "executionModel", [
        "ideal_same_close",
        "next_open",
        "next_close",
      ]);
      const priceBasis = parseOptionalEnumField(req.query.priceBasis, "priceBasis", [
        "adjusted_close",
        "raw_close_with_actions",
      ]);
      const overrides = parseOverrides(req.query as Record<string, unknown>, { includePriceBasis: false });
      res.json(
        await backtestService.strategyDetail({
          profileId,
          csvPath,
          initialCapital,
          strategyId,
          sliceStart,
          sliceEnd,
          executionModel,
          priceBasis,
          overrides,
        }),
      );
    }),
  );

  router.get(
    "/regime-walk-forward",
    asyncHandler(async (req, res) => {
      const profileId = typeof req.query.profileId === "string" ? req.query.profileId : defaultProfileId;
      const csvPath = typeof req.query.csvPath === "string" && req.query.csvPath.trim() !== "" ? req.query.csvPath : undefined;
      const initialCapital = parseNumber(req.query.initialCapital, 10000);
      const maxWorkers = parseOptionalNumberField(req.query.maxWorkers, "maxWorkers", { integer: true, min: 1 }) ?? 1;
      res.json(
        await backtestService.regimeWalkForward({
          profileId,
          csvPath,
          initialCapital,
          maxWorkers,
        }),
      );
    }),
  );

  router.get(
    "/official-explorer",
    asyncHandler(async (req, res) => {
      const profileId = typeof req.query.profileId === "string" ? req.query.profileId : defaultProfileId;
      const csvPath = typeof req.query.csvPath === "string" && req.query.csvPath.trim() !== "" ? req.query.csvPath : undefined;
      const initialCapital = parseNumber(req.query.initialCapital, 10000);
      res.json(
        await backtestService.officialExplorer({
          profileId,
          csvPath,
          initialCapital,
        }),
      );
    }),
  );

  router.get(
    "/thread-timeline",
    asyncHandler(async (req, res) => {
      const profileId = typeof req.query.profileId === "string" ? req.query.profileId : defaultProfileId;
      const csvPath = typeof req.query.csvPath === "string" && req.query.csvPath.trim() !== "" ? req.query.csvPath : undefined;
      const initialCapital = parseNumber(req.query.initialCapital, 10000);
      const strategyId = requireString(req.query.strategyId, "strategyId");
      const sliceStart = typeof req.query.sliceStart === "string" && req.query.sliceStart.trim() !== "" ? req.query.sliceStart : undefined;
      const sliceEnd = typeof req.query.sliceEnd === "string" && req.query.sliceEnd.trim() !== "" ? req.query.sliceEnd : undefined;
      const executionModel = parseOptionalEnumField(req.query.executionModel, "executionModel", [
        "ideal_same_close",
        "next_open",
        "next_close",
      ]);
      const priceBasis = parseOptionalEnumField(req.query.priceBasis, "priceBasis", [
        "adjusted_close",
        "raw_close_with_actions",
      ]);
      const overrides = parseOverrides(req.query as Record<string, unknown>, { includePriceBasis: false });
      res.json(
        await backtestService.threadTimeline({
          profileId,
          csvPath,
          initialCapital,
          strategyId,
          sliceStart,
          sliceEnd,
          executionModel,
          priceBasis,
          overrides,
        }),
      );
    }),
  );

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      res.json(await backtestService.getOverview());
    }),
  );

  router.post(
    "/jobs",
    asyncHandler(async (req, res) => {
      const body = req.body ?? {};
      const job = await backtestService.createJob({
        profileId: requireString(body.profileId, "profileId"),
        csvPath: typeof body.csvPath === "string" && body.csvPath.trim() !== "" ? body.csvPath : undefined,
        initialCapital: parseNumber(body.initialCapital, 10000),
        overrides: parseOverrides((body.overrides ?? {}) as Record<string, unknown>),
      });
      res.status(202).json(job);
    }),
  );

  router.get(
    "/sweeps/latest",
    asyncHandler(async (req, res) => {
      const profileId = typeof req.query.profileId === "string" ? req.query.profileId : defaultProfileId;
      const csvPath = typeof req.query.csvPath === "string" && req.query.csvPath.trim() !== "" ? req.query.csvPath : undefined;
      const initialCapital = parseNumber(req.query.initialCapital, 10000);
      const executionModel = parseOptionalEnumField(req.query.executionModel, "executionModel", [
        "ideal_same_close",
        "next_open",
        "next_close",
      ]);
      const priceBasis = parseOptionalEnumField(req.query.priceBasis, "priceBasis", [
        "adjusted_close",
        "raw_close_with_actions",
      ]);
      const sweepId = typeof req.query.sweepId === "string" && req.query.sweepId.trim() !== "" ? req.query.sweepId : undefined;
      res.json(
        await backtestService.getLatestSweep({
          profileId,
          csvPath,
          initialCapital,
          executionModel,
          priceBasis,
          sweepId,
        }),
      );
    }),
  );

  router.post(
    "/sweeps/jobs",
    asyncHandler(async (req, res) => {
      const body = req.body ?? {};
      const executionModel = parseOptionalEnumField(body.executionModel, "executionModel", [
        "ideal_same_close",
        "next_open",
        "next_close",
      ]);
      const priceBasis = parseOptionalEnumField(body.priceBasis, "priceBasis", [
        "adjusted_close",
        "raw_close_with_actions",
      ]);
      const job = await backtestService.createSweepJob({
        profileId: requireString(body.profileId, "profileId"),
        csvPath: typeof body.csvPath === "string" && body.csvPath.trim() !== "" ? body.csvPath : undefined,
        initialCapital: parseNumber(body.initialCapital, 10000),
        sweepId: typeof body.sweepId === "string" && body.sweepId.trim() !== "" ? body.sweepId : undefined,
        executionModel,
        priceBasis,
      });
      res.status(202).json(job);
    }),
  );

  router.get(
    "/sweeps/jobs/:jobId",
    asyncHandler(async (req, res) => {
      res.json(await backtestService.getJob(requireString(req.params.jobId, "jobId")));
    }),
  );

  router.get(
    "/sweeps/runs/:artifactId",
    asyncHandler(async (req, res) => {
      res.json(await backtestService.getSweepArtifact(requireString(req.params.artifactId, "artifactId")));
    }),
  );

  router.get(
    "/jobs/:jobId",
    asyncHandler(async (req, res) => {
      res.json(await backtestService.getJob(requireString(req.params.jobId, "jobId")));
    }),
  );

  router.get(
    "/runs/:runId",
    asyncHandler(async (req, res) => {
      const artifact = await backtestService.getRun(requireString(req.params.runId, "runId"));
      res.json(artifact);
    }),
  );

  router.get(
    "/runs/:runId/trades.csv",
    asyncHandler(async (req, res) => {
      const runId = requireString(req.params.runId, "runId");
      const csv = await backtestService.getRunTradesCsv(runId);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${runId}-trades.csv"`);
      res.send(csv);
    }),
  );

  router.get(
    "/compare",
    asyncHandler(async (req, res) => {
      const profileId = typeof req.query.profileId === "string" ? req.query.profileId : defaultProfileId;
      const csvPath = typeof req.query.csvPath === "string" && req.query.csvPath.trim() !== "" ? req.query.csvPath : undefined;
      const initialCapital = parseNumber(req.query.initialCapital, 10000);
      const threads = parseCsvList(req.query.threads, [5, 6, 7]);
      const stops = parseCsvList(req.query.stops, [10, 30, 40]);
      const overrides = parseOverrides(req.query as Record<string, unknown>);
      res.json(
        await backtestService.compare({
          profileId,
          csvPath,
          initialCapital,
          threads,
          stops,
          overrides,
        }),
      );
    }),
  );

  router.get(
    "/official-matrix",
    asyncHandler(async (req, res) => {
      const profileId = typeof req.query.profileId === "string" ? req.query.profileId : defaultProfileId;
      const csvPath = typeof req.query.csvPath === "string" && req.query.csvPath.trim() !== "" ? req.query.csvPath : undefined;
      const initialCapital = parseNumber(req.query.initialCapital, 10000);
      const threads = parseCsvList(req.query.threads, [5, 6, 7]);
      const stops = parseCsvList(req.query.stops, [10, 30, 40]);
      const overrides = parseOverrides(req.query as Record<string, unknown>);
      res.json(
        await backtestService.officialMatrix({
          profileId,
          csvPath,
          initialCapital,
          threads,
          stops,
          overrides,
        }),
      );
    }),
  );

  router.get(
    "/mentor-matrix",
    asyncHandler(async (req, res) => {
      const profileId = typeof req.query.profileId === "string" ? req.query.profileId : defaultProfileId;
      const csvPath = typeof req.query.csvPath === "string" && req.query.csvPath.trim() !== "" ? req.query.csvPath : undefined;
      const initialCapital = parseNumber(req.query.initialCapital, 10000);
      const threads = parseCsvList(req.query.threads, [5, 6, 7]);
      const stops = parseCsvList(req.query.stops, [10, 30, 40]);
      const overrides = parseOverrides(req.query as Record<string, unknown>);
      res.json(
        await backtestService.mentorMatrix({
          profileId,
          csvPath,
          initialCapital,
          threads,
          stops,
          overrides,
        }),
      );
    }),
  );

  router.get(
    "/risk",
    asyncHandler(async (req, res) => {
      const profileId = typeof req.query.profileId === "string" ? req.query.profileId : defaultProfileId;
      const csvPath = typeof req.query.csvPath === "string" && req.query.csvPath.trim() !== "" ? req.query.csvPath : undefined;
      const initialCapital = parseNumber(req.query.initialCapital, 10000);
      const overrides = parseOverrides(req.query as Record<string, unknown>);
      res.json(
        await backtestService.riskReport({
          profileId,
          csvPath,
          initialCapital,
          overrides,
        }),
      );
    }),
  );

  return router;
}
