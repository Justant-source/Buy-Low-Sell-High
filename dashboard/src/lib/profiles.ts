import path from "node:path";

import { configsRoot } from "./paths.js";
import type { ProfileDefinition } from "./types.js";

const PROFILES: ProfileDefinition[] = [
  {
    workspaceId: "soxl",
    profileId: "soxl_official_ddeolsao_pal_v1",
    name: "SOXL Official DdeolsaoPal v1",
    description: "Official Yahoo adjusted-close research baseline for the SOXL daily-close strategy.",
    profilePath: path.join(configsRoot, "soxl_official_ddeolsao_pal_v1.yaml"),
    symbol: "SOXL",
    threadCount: 5,
    stopSessions: 40,
    priceBasis: "adjusted_close",
    executionModel: "ideal_same_close",
  },
  {
    workspaceId: "soxl",
    profileId: "soxl_default_7x30",
    name: "SOXL Default 7x30",
    description: "SOXL daily-close comparison profile with 7 threads and 30-session stops.",
    profilePath: path.join(configsRoot, "soxl_default_7x30.yaml"),
    symbol: "SOXL",
    threadCount: 7,
    stopSessions: 30,
    priceBasis: "adjusted_close",
    executionModel: "ideal_same_close",
  },
  {
    workspaceId: "soxl",
    profileId: "soxl_default_5x30",
    name: "SOXL Default 5x30",
    description: "Baseline SOXL daily-close comparison profile.",
    profilePath: path.join(configsRoot, "soxl_default_5x30.yaml"),
    symbol: "SOXL",
    threadCount: 5,
    stopSessions: 30,
    priceBasis: "adjusted_close",
    executionModel: "ideal_same_close",
  },
  {
    workspaceId: "soxl",
    profileId: "soxl_best_avg_5x40",
    name: "SOXL Best Avg 5x40",
    description: "Reference profile for the higher-return SOXL comparison cell.",
    profilePath: path.join(configsRoot, "soxl_best_avg_5x40.yaml"),
    symbol: "SOXL",
    threadCount: 5,
    stopSessions: 40,
    priceBasis: "adjusted_close",
    executionModel: "ideal_same_close",
  },
  {
    workspaceId: "soxl",
    profileId: "soxl_low_vol_7x10",
    name: "SOXL Low Vol 7x10",
    description: "Lower-volatility SOXL comparison profile.",
    profilePath: path.join(configsRoot, "soxl_low_vol_7x10.yaml"),
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

export function listProfileDefinitionsForWorkspace(workspaceId: string): ProfileDefinition[] {
  return PROFILES.filter((profile) => profile.workspaceId === workspaceId).map((profile) => ({ ...profile }));
}

export function getProfileDefinition(profileId: string): ProfileDefinition | undefined {
  return PROFILES.find((profile) => profile.profileId === profileId);
}

export const defaultProfileId = PROFILES[0].profileId;

export function getDefaultProfileIdForWorkspace(workspaceId: string): string | undefined {
  return PROFILES.find((profile) => profile.workspaceId === workspaceId)?.profileId;
}
