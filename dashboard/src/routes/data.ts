import { Router } from "express";

import { asyncHandler } from "../lib/http.js";
import { getDataStatus } from "../lib/data-service.js";
import { defaultCsvPath } from "../lib/paths.js";

export function createDataRouter(): Router {
  const router = Router();

  router.get(
    "/status",
    asyncHandler(async (req, res) => {
      const csvPath = typeof req.query.csvPath === "string" ? req.query.csvPath : defaultCsvPath;
      const symbol = typeof req.query.symbol === "string" ? req.query.symbol : "SOXL";
      const status = await getDataStatus(csvPath, symbol);
      res.json(status);
    }),
  );

  return router;
}
