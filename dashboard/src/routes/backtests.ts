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

function parseOptionalEnumField<T extends string>(value: unknown, fieldName: string, allowed: readonly T[]): T | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new HttpError(400, `Invalid ${fieldName}`);
  }
  return value as T;
}

function parseOverrides(source: Record<string, unknown>): BacktestOverrides | undefined {
  const overrides: BacktestOverrides = {};
  const threadCount = parseOptionalNumberField(source.threadCount, "threadCount", { integer: true, min: 1 });
  const stopSessions = parseOptionalNumberField(source.stopSessions, "stopSessions", { integer: true, min: 1 });
  const takeProfitPct = parseOptionalNumberField(source.takeProfitPct, "takeProfitPct", { min: 0 });
  const entryDropPct = parseOptionalNumberField(source.entryDropPct, "entryDropPct", { min: 0 });
  const stopLossPct = parseOptionalNumberField(source.stopLossPct, "stopLossPct", { min: 0 });
  const maxEntriesPerSession = parseOptionalNumberField(source.maxEntriesPerSession, "maxEntriesPerSession", {
    integer: true,
    min: 1,
  });
  const takeProfitOperator = parseOptionalEnumField(source.takeProfitOperator, "takeProfitOperator", ["gt", "gte"]);
  const sizingMode = parseOptionalEnumField(source.sizingMode, "sizingMode", [
    "fixed_principal",
    "thread_compound",
    "portfolio_rebalance_compound",
  ]);
  const priceBasis = parseOptionalEnumField(source.priceBasis, "priceBasis", [
    "adjusted_close",
    "raw_close_with_actions",
  ]);
  if (threadCount != null) overrides.threadCount = threadCount;
  if (stopSessions != null) overrides.stopSessions = stopSessions;
  if (takeProfitPct != null) overrides.takeProfitPct = takeProfitPct;
  if (takeProfitOperator) overrides.takeProfitOperator = takeProfitOperator;
  if (entryDropPct != null) overrides.entryDropPct = entryDropPct;
  if (stopLossPct != null) overrides.stopLossPct = stopLossPct;
  if (maxEntriesPerSession != null) overrides.maxEntriesPerSession = maxEntriesPerSession;
  if (sizingMode) overrides.sizingMode = sizingMode;
  if (priceBasis) overrides.priceBasis = priceBasis;
  return Object.keys(overrides).length ? overrides : undefined;
}

export function createBacktestsRouter(backtestService: BacktestService): Router {
  const router = Router();

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
