import path from "node:path";

import { configsRoot } from "./paths.js";
import type { ProfileDefinition } from "./types.js";

const PROFILES: ProfileDefinition[] = [
  {
    profileId: "mentor_default_7x30",
    name: "Mentor Default 7x30",
    description: "Dashboard default profile for tunable SOXL daily-close research with 7 threads and 30-session stops.",
    profilePath: path.join(configsRoot, "mentor_default_7x30.yaml"),
    symbol: "SOXL",
    threadCount: 7,
    stopSessions: 30,
    priceBasis: "adjusted_close",
    executionModel: "ideal_same_close",
  },
  {
    profileId: "mentor_default_5x30",
    name: "Mentor Default 5x30",
    description: "Baseline mentor profile for SOXL daily-close research and manual operations.",
    profilePath: path.join(configsRoot, "mentor_default_5x30.yaml"),
    symbol: "SOXL",
    threadCount: 5,
    stopSessions: 30,
    priceBasis: "adjusted_close",
    executionModel: "ideal_same_close",
  },
  {
    profileId: "mentor_grid_best_avg_5x40",
    name: "Mentor Grid Best Avg 5x40",
    description: "Reference profile for the higher-return mentor comparison cell.",
    profilePath: path.join(configsRoot, "mentor_grid_best_avg_5x40.yaml"),
    symbol: "SOXL",
    threadCount: 5,
    stopSessions: 40,
    priceBasis: "adjusted_close",
    executionModel: "ideal_same_close",
  },
  {
    profileId: "mentor_low_vol_7x10",
    name: "Mentor Low Vol 7x10",
    description: "Lower-volatility comparison profile for manual scenario review.",
    profilePath: path.join(configsRoot, "mentor_low_vol_7x10.yaml"),
    symbol: "SOXL",
    threadCount: 7,
    stopSessions: 10,
    priceBasis: "adjusted_close",
    executionModel: "ideal_same_close",
  },
];

export function listProfileDefinitions(): ProfileDefinition[] {
  return PROFILES.map((profile) => ({ ...profile }));
}

export function getProfileDefinition(profileId: string): ProfileDefinition | undefined {
  return PROFILES.find((profile) => profile.profileId === profileId);
}

export const defaultProfileId = PROFILES[0].profileId;
