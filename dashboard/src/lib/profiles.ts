import path from "node:path";

import { configsRoot } from "./paths.js";
import type { ProfileDefinition } from "./types.js";

function profilePath(profileId: string): string {
  return path.join(configsRoot, `${profileId}.yaml`);
}

function makeProfile(
  workspaceId: string,
  profileId: string,
  name: string,
  description: string,
  symbol: string,
  threadCount: number,
  stopSessions: number,
  priceBasis: string,
): ProfileDefinition {
  return {
    workspaceId,
    profileId,
    name,
    description,
    profilePath: profilePath(profileId),
    symbol,
    threadCount,
    stopSessions,
    priceBasis,
    executionModel: "ideal_same_close",
  };
}

const PROFILES: ProfileDefinition[] = [
  makeProfile(
    "soxl",
    "soxl_official_ddeolsao_pal_v1",
    "SOXL Official DdeolsaoPal v1",
    "Official Yahoo adjusted-close research baseline for the SOXL daily-close strategy.",
    "SOXL",
    5,
    40,
    "adjusted_close",
  ),
  makeProfile(
    "soxl",
    "soxl_default_7x30",
    "SOXL Default 7x30",
    "SOXL daily-close comparison profile with 7 threads and 30-session stops.",
    "SOXL",
    7,
    30,
    "adjusted_close",
  ),
  makeProfile(
    "soxl",
    "soxl_default_5x30",
    "SOXL Default 5x30",
    "Baseline SOXL daily-close comparison profile.",
    "SOXL",
    5,
    30,
    "adjusted_close",
  ),
  makeProfile(
    "soxl",
    "soxl_best_avg_5x40",
    "SOXL Best Avg 5x40",
    "Reference profile for the higher-return SOXL comparison cell.",
    "SOXL",
    5,
    40,
    "adjusted_close",
  ),
  makeProfile(
    "0193t0",
    "0193t0_default_5x30",
    "0193T0 Default 5x30",
    "Baseline 0193T0 daily-close comparison profile.",
    "0193T0",
    5,
    30,
    "raw_close_with_actions",
  ),
  makeProfile(
    "0193t0",
    "0193t0_default_7x30",
    "0193T0 Default 7x30",
    "0193T0 daily-close comparison profile with 7 threads and 30-session stops.",
    "0193T0",
    7,
    30,
    "raw_close_with_actions",
  ),
  makeProfile(
    "0193t0",
    "0193t0_best_avg_5x40",
    "0193T0 Best Avg 5x40",
    "0193T0 comparison profile for the higher-return combo cell.",
    "0193T0",
    5,
    40,
    "raw_close_with_actions",
  ),
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
