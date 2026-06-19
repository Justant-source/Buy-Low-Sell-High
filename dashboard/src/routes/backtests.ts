import { Router } from "express";

import { asyncHandler, parseCsvList, parseNumber, requireString } from "../lib/http.js";
import type { BacktestService } from "../lib/backtest-service.js";

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
      });
      res.status(202).json(job);
    }),
  );

  router.get(
    "/jobs/:jobId",
    asyncHandler(async (req, res) => {
      res.json(await backtestService.getJob(req.params.jobId));
    }),
  );

  router.get(
    "/runs/:runId",
    asyncHandler(async (req, res) => {
      const artifact = await backtestService.getRun(req.params.runId);
      res.json(artifact);
    }),
  );

  router.get(
    "/runs/:runId/trades.csv",
    asyncHandler(async (req, res) => {
      const csv = await backtestService.getRunTradesCsv(req.params.runId);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${req.params.runId}-trades.csv"`);
      res.send(csv);
    }),
  );

  router.get(
    "/compare",
    asyncHandler(async (req, res) => {
      const profileId = typeof req.query.profileId === "string" ? req.query.profileId : "mentor_default_5x30";
      const csvPath = typeof req.query.csvPath === "string" && req.query.csvPath.trim() !== "" ? req.query.csvPath : undefined;
      const initialCapital = parseNumber(req.query.initialCapital, 10000);
      const threads = parseCsvList(req.query.threads, [5, 6, 7]);
      const stops = parseCsvList(req.query.stops, [10, 30, 40]);
      res.json(
        await backtestService.compare({
          profileId,
          csvPath,
          initialCapital,
          threads,
          stops,
        }),
      );
    }),
  );

  return router;
}
