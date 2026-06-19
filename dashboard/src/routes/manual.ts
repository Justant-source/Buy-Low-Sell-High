import { Router } from "express";

import { asyncHandler, parseNumber, requireFiniteNumber, requireString } from "../lib/http.js";
import {
  getManualLedger,
  getTodayRecommendations,
  recordManualFill,
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
    "/ledger",
    asyncHandler(async (req, res) => {
      const profileId = typeof req.query.profileId === "string" ? req.query.profileId : defaultProfileId;
      const initialCapital = parseNumber(req.query.initialCapital, 10000);
      res.json(await getManualLedger(profileId, initialCapital));
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
      res.status(201).json(await reverseManualFill(profileId, req.params.fillId, initialCapital));
    }),
  );

  return router;
}
