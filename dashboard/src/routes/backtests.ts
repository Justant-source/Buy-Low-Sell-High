import { Router } from "express";

export const backtestsRouter = Router();

backtestsRouter.get("/", (_req, res) => {
  res.json({
    status: "placeholder",
    implementedIn: "engine/src/soxl_mania/backtest"
  });
});

backtestsRouter.get("/compare", (_req, res) => {
  res.json({
    status: "placeholder",
    note: "Comparison matrix UI wiring remains pending Node toolchain setup"
  });
});

