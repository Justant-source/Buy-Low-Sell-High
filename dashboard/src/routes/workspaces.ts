import { Router } from "express";

import { asyncHandler } from "../lib/http.js";
import { defaultWorkspaceId, listWorkspaceDefinitions } from "../lib/workspaces.js";

export function createWorkspacesRouter(): Router {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      res.json({
        defaultWorkspaceId,
        workspaces: listWorkspaceDefinitions(),
      });
    }),
  );

  return router;
}
