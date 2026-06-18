import { Router } from "express";

export const manualRouter = Router();

manualRouter.get("/today", (_req, res) => {
  res.json({
    status: "placeholder",
    note: "Recommendation generation exists in Python engine"
  });
});

