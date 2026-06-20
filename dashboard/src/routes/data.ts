import { Router } from "express";

import { asyncHandler, HttpError } from "../lib/http.js";
import { getDataStatus } from "../lib/data-service.js";
import { defaultCsvPathForSymbol } from "../lib/paths.js";
import { defaultWorkspaceDefinition, getWorkspaceDefinition } from "../lib/workspaces.js";

export function createDataRouter(): Router {
  const router = Router();

  router.get(
    "/status",
    asyncHandler(async (req, res) => {
      const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : undefined;
      const workspace =
        (workspaceId ? getWorkspaceDefinition(workspaceId) : undefined) ?? defaultWorkspaceDefinition();
      if (workspaceId && !getWorkspaceDefinition(workspaceId)) {
        throw new HttpError(404, `Unknown workspaceId: ${workspaceId}`);
      }
      const symbol = typeof req.query.symbol === "string" ? req.query.symbol : workspace.symbol;
      const csvPath =
        typeof req.query.csvPath === "string" ? req.query.csvPath : defaultCsvPathForSymbol(symbol);
      const status = await getDataStatus(csvPath, symbol);
      res.json(status);
    }),
  );

  return router;
}
