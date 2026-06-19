import express from "express";
import type { NextFunction, Request, Response } from "express";
import path from "node:path";

import { BacktestService } from "./lib/backtest-service.js";
import { HttpError } from "./lib/http.js";
import { publicRoot } from "./lib/paths.js";
import { createBacktestsRouter } from "./routes/backtests.js";
import { createDataRouter } from "./routes/data.js";
import { createManualRouter } from "./routes/manual.js";
import { createProfilesRouter } from "./routes/profiles.js";

const app = express();
const port = Number(process.env.PORT ?? process.env.DASHBOARD_PORT ?? 3000);
const backtestService = new BacktestService();
const startedAt = Date.now();

app.use(express.json());
app.use(express.static(publicRoot));

app.get("/api/health", (_req, res) => {
  res.json({
    service: "soxl-mania-dashboard",
    status: "ok",
    phase: "dashboard-v1",
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
  });
});

app.use("/api/data", createDataRouter());
app.use("/api/profiles", createProfilesRouter());
app.use("/api/backtests", createBacktestsRouter(backtestService));
app.use("/api/manual", createManualRouter());

app.get("/", (_req, res) => {
  res.sendFile(path.join(publicRoot, "backtests.html"));
});

app.get("/monitor", (_req, res) => {
  res.sendFile(path.join(publicRoot, "monitor.html"));
});

app.get("/backtests", (_req, res) => {
  res.sendFile(path.join(publicRoot, "backtests.html"));
});

app.get("/manual", (_req, res) => {
  res.sendFile(path.join(publicRoot, "manual.html"));
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
  console.log(`SOXL-Mania dashboard listening on ${port}`);
});
