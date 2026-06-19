import { Router } from "express";

import { asyncHandler, parseNumber, requireFiniteNumber, requireString } from "../lib/http.js";
import {
  exportManualLedger,
  getManualComparison,
  getManualLedger,
  getManualThreads,
  getManualHistory,
  getTodayRecommendations,
  reconcileManualLedger,
  recordManualFill,
  restoreManualLedger,
  reverseManualFill,
} from "../lib/manual-service.js";
import { defaultCsvPath } from "../lib/paths.js";
import { defaultProfileId } from "../lib/profiles.js";

export function createManualRouter(): Router {
  const router = Router();

  router.get(
    "/today",
    asyncHandler(async (req, res) => {
      const profileId = typeof req.query.profileId === "string" ? req.query.profileId : defaultProfileId;
      const csvPath = typeof req.query.csvPath === "string" ? req.query.csvPath : defaultCsvPath;
      const initialCapital = parseNumber(req.query.initialCapital, 10000);
      res.json(await getTodayRecommendations(profileId, csvPath, initialCapital));
    }),
  );

  router.get(
    "/comparison",
    asyncHandler(async (req, res) => {
      const profileId = typeof req.query.profileId === "string" ? req.query.profileId : defaultProfileId;
      const csvPath = typeof req.query.csvPath === "string" ? req.query.csvPath : defaultCsvPath;
      const initialCapital = parseNumber(req.query.initialCapital, 10000);
      res.json(await getManualComparison(profileId, csvPath, initialCapital));
    }),
  );

  router.get(
    "/ledger",
    asyncHandler(async (req, res) => {
      const profileId = typeof req.query.profileId === "string" ? req.query.profileId : defaultProfileId;
      const initialCapital = parseNumber(req.query.initialCapital, 10000);
      res.json(await getManualLedger(profileId, initialCapital));
    }),
  );

  router.get(
    "/threads",
    asyncHandler(async (req, res) => {
      const profileId = typeof req.query.profileId === "string" ? req.query.profileId : defaultProfileId;
      const initialCapital = parseNumber(req.query.initialCapital, 10000);
      res.json(await getManualThreads(profileId, initialCapital));
    }),
  );

  router.get(
    "/history",
    asyncHandler(async (req, res) => {
      const profileId = typeof req.query.profileId === "string" ? req.query.profileId : defaultProfileId;
      const initialCapital = parseNumber(req.query.initialCapital, 10000);
      res.json(await getManualHistory(profileId, initialCapital));
    }),
  );

  router.post(
    "/reconcile",
    asyncHandler(async (req, res) => {
      const body = req.body ?? {};
      const profileId =
        typeof body.profileId === "string"
          ? body.profileId
          : typeof req.query.profileId === "string"
            ? req.query.profileId
            : defaultProfileId;
      const initialCapital = parseNumber(body.initialCapital ?? req.query.initialCapital, 10000);
      res.json(await reconcileManualLedger(profileId, initialCapital));
    }),
  );

  router.post(
    "/fills",
    asyncHandler(async (req, res) => {
      const body = req.body ?? {};
      res.status(201).json(
        await recordManualFill({
          profileId: requireString(body.profileId ?? defaultProfileId, "profileId"),
          threadId: requireFiniteNumber(body.threadId, "threadId"),
          side: requireString(body.side, "side"),
          quantity: requireString(body.quantity, "quantity"),
          price: requireString(body.price, "price"),
          fee: typeof body.fee === "string" ? body.fee : undefined,
          filledAt: typeof body.filledAt === "string" ? body.filledAt : undefined,
          initialCapital: parseNumber(body.initialCapital, 10000),
        }),
      );
    }),
  );

  router.post(
    "/fills/:fillId/reverse",
    asyncHandler(async (req, res) => {
      const body = req.body ?? {};
      const profileId =
        typeof body.profileId === "string"
          ? body.profileId
          : typeof req.query.profileId === "string"
            ? req.query.profileId
            : defaultProfileId;
      const initialCapital = parseNumber(body.initialCapital ?? req.query.initialCapital, 10000);
      res.status(201).json(await reverseManualFill(profileId, requireString(req.params.fillId, "fillId"), initialCapital));
    }),
  );

  router.get(
    "/export",
    asyncHandler(async (req, res) => {
      const profileId = typeof req.query.profileId === "string" ? req.query.profileId : defaultProfileId;
      const initialCapital = parseNumber(req.query.initialCapital, 10000);
      const format = typeof req.query.format === "string" ? req.query.format : "json";
      const exported = await exportManualLedger(profileId, format, initialCapital);
      res.setHeader("Content-Type", exported.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${exported.filename}"`);
      res.send(exported.content);
    }),
  );

  router.post(
    "/restore",
    asyncHandler(async (req, res) => {
      const body = req.body ?? {};
      const restored = await restoreManualLedger({
        profileId: requireString(body.profileId ?? defaultProfileId, "profileId"),
        payload: body.payload,
        confirmToken: requireString(body.confirmToken, "confirmToken"),
        initialCapital: parseNumber(body.initialCapital, 10000),
      });
      res.status(201).json(restored);
    }),
  );

  return router;
}
