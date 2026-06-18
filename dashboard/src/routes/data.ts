import { Router } from "express";

export const dataRouter = Router();

dataRouter.get("/status", (_req, res) => {
  res.json({
    status: "placeholder",
    source: "python-cli-backed implementation pending Node runtime setup"
  });
});

