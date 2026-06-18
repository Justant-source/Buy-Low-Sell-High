import express from "express";
import path from "node:path";

import { backtestsRouter } from "./routes/backtests.js";
import { dataRouter } from "./routes/data.js";
import { manualRouter } from "./routes/manual.js";
import { profilesRouter } from "./routes/profiles.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json());
app.use(express.static(path.resolve(process.cwd(), "public")));

app.get("/api/health", (_req, res) => {
  res.json({
    service: "dashboard",
    status: "ok",
    phase: "0-5-partial",
    scope: "bootstrap, engine, parity, and manual-ledger skeleton"
  });
});

app.use("/api/data", dataRouter);
app.use("/api/profiles", profilesRouter);
app.use("/api/backtests", backtestsRouter);
app.use("/api/manual", manualRouter);

app.listen(port, () => {
  console.log(`SOXL-Mania dashboard skeleton listening on ${port}`);
});

