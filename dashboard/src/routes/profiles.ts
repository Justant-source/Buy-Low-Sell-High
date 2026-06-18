import { Router } from "express";

export const profilesRouter = Router();

profilesRouter.get("/", (_req, res) => {
  res.json([
    { profileId: "mentor_default_5x30", threadCount: 5, stopSessions: 30 },
    { profileId: "mentor_grid_best_avg_5x40", threadCount: 5, stopSessions: 40 },
    { profileId: "mentor_low_vol_7x10", threadCount: 7, stopSessions: 10 }
  ]);
});

