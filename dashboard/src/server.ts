import express from "express";
import type { NextFunction, Request, Response } from "express";
import path from "node:path";

import { BacktestService } from "./lib/backtest-service.js";
import { HttpError } from "./lib/http.js";
import { publicRoot, repoRoot } from "./lib/paths.js";
import { describeResearchStoreTarget } from "./lib/research-store.js";
import { createBacktestsRouter } from "./routes/backtests.js";
import { createDataRouter } from "./routes/data.js";
import { createProfilesRouter } from "./routes/profiles.js";
import { createWorkspacesRouter } from "./routes/workspaces.js";
import { defaultWorkspaceDefinition } from "./lib/workspaces.js";

const app = express();
const port = Number(process.env.PORT ?? process.env.DASHBOARD_PORT ?? 3232);
const backtestService = new BacktestService();
const startedAt = Date.now();

app.use(express.json());
app.use(express.static(publicRoot));

app.get("/api/health", (_req, res) => {
  res.json({
    service: "buy-low-sell-high-dashboard",
    status: "ok",
    phase: "dashboard-v1",
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
  });
});

app.use("/api/data", createDataRouter());
app.use("/api/workspaces", createWorkspacesRouter());
app.use("/api/profiles", createProfilesRouter());
app.use("/api/backtests", createBacktestsRouter(backtestService));

app.get("/", (_req, res) => {
  res.redirect(`/backtests/${defaultWorkspaceDefinition().routeSlug}`);
});

app.get("/backtests", (_req, res) => {
  res.redirect(`/backtests/${defaultWorkspaceDefinition().routeSlug}`);
});

app.get("/backtests/:workspaceSlug", (_req, res) => {
  res.sendFile(path.join(publicRoot, "backtests.html"));
});

app.get("/assets/mentor-reference.jpg", (_req, res) => {
  res.sendFile(path.join(repoRoot, ".request", "멘토_떨사오팔_백테스트결과.jpg"));
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({
      error: error.message,
      detail: error.detail,
    });
    return;
  }
  const message = error instanceof Error ? error.message : "Unknown dashboard error";
  res.status(500).json({
    error: message,
  });
});

app.listen(port, () => {
  console.log(`Buy-Low-Sell-High dashboard listening on ${port}`);
  console.log(`Research store: ${describeResearchStoreTarget()}`);
  void backtestService.warmDefaultStrategyPresetRankings().then(() => {
    console.log("Preset ranking warmup completed for default workspaces");
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Preset ranking warmup failed: ${message}`);
  });
});
