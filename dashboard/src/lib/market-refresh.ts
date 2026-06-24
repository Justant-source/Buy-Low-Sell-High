import { readFileSync } from "node:fs";
import path from "node:path";

import { repoRoot } from "./paths.js";

export interface MarketRefreshSyncTarget {
  symbol: string;
  depends_on_symbols?: string[];
}

export interface MarketRefreshMaterializationTarget {
  workspace_id: string;
  profile_id: string;
  dependency_symbols: string[];
}

export interface MarketRefreshDefinition {
  cron_timezone: string;
  cron_schedule: string;
  sync_targets: MarketRefreshSyncTarget[];
  materialization_targets: MarketRefreshMaterializationTarget[];
}

export interface MarketRefreshConfig {
  markets: Record<string, MarketRefreshDefinition>;
}

let cachedConfig: MarketRefreshConfig | null = null;

export function marketRefreshConfigPath(): string {
  return path.join(repoRoot, "configs", "automation", "market_refresh.json");
}

export function loadMarketRefreshConfig(): MarketRefreshConfig {
  if (cachedConfig) {
    return cachedConfig;
  }
  cachedConfig = JSON.parse(readFileSync(marketRefreshConfigPath(), "utf-8")) as MarketRefreshConfig;
  return cachedConfig;
}

export function getMarketRefreshDefinition(market: string): MarketRefreshDefinition {
  const key = market.toLowerCase();
  const definition = loadMarketRefreshConfig().markets[key];
  if (!definition) {
    throw new Error(`Unknown market refresh config: ${market}`);
  }
  return definition;
}

export function resolveMarketMaterializationTargets(
  market: string,
  explicitProfileIds: string[] = [],
): MarketRefreshMaterializationTarget[] {
  const definition = getMarketRefreshDefinition(market);
  const dedupedExplicit = [...new Set(explicitProfileIds)];
  if (dedupedExplicit.length === 0) {
    return definition.materialization_targets.map((target) => ({ ...target, dependency_symbols: [...target.dependency_symbols] }));
  }
  const allowed = new Set(definition.materialization_targets.map((target) => target.profile_id));
  for (const profileId of dedupedExplicit) {
    if (!allowed.has(profileId)) {
      throw new Error(`Profile ${profileId} is not configured for market ${market}`);
    }
  }
  return definition.materialization_targets
    .filter((target) => dedupedExplicit.includes(target.profile_id))
    .map((target) => ({ ...target, dependency_symbols: [...target.dependency_symbols] }));
}
