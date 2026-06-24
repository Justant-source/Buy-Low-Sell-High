import { pathToFileURL } from "node:url";

import { BacktestService } from "./lib/backtest-service.js";
import { getProfileDefinition } from "./lib/profiles.js";
import { getMarketRefreshDefinition, resolveMarketMaterializationTargets } from "./lib/market-refresh.js";
import { getWorkspaceDefinition } from "./lib/workspaces.js";

export interface MaterializeMarketCliArgs {
  market: string;
  profileIds: string[];
  maxWorkers: number;
  sweepMaxWorkers?: number;
  sweepChunkSize?: number;
}

function printHelp(): void {
  console.log(
    [
      "usage: node dashboard/dist/materialize-market.js --market <kr|us> [options]",
      "",
      "options:",
      "  --market <id>                  market id from configs/automation/market_refresh.json",
      "  --profile-id <id[,id...]>      optional subset of configured profile ids",
      "  --max-workers <number>         concurrent profile materializations",
      "  --sweep-max-workers <number>   sweep engine worker limit override",
      "  --sweep-chunk-size <number>    sweep chunk size override",
    ].join("\n"),
  );
}

function parseCsvOption(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePositiveNumber(value: string, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    throw new Error(`Invalid ${fieldName}: ${value}`);
  }
  return parsed;
}

export function parseMaterializeMarketCliArgs(argv: string[]): MaterializeMarketCliArgs {
  const args: MaterializeMarketCliArgs = {
    market: "",
    profileIds: [],
    maxWorkers: 1,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const nextValue = (): string => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${token}`);
      }
      index += 1;
      return value;
    };
    switch (token) {
      case "--market":
        args.market = nextValue().toLowerCase();
        break;
      case "--profile-id":
        args.profileIds.push(...parseCsvOption(nextValue()));
        break;
      case "--max-workers":
        args.maxWorkers = parsePositiveNumber(nextValue(), "max-workers");
        break;
      case "--sweep-max-workers":
        args.sweepMaxWorkers = parsePositiveNumber(nextValue(), "sweep-max-workers");
        break;
      case "--sweep-chunk-size":
        args.sweepChunkSize = parsePositiveNumber(nextValue(), "sweep-chunk-size");
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown option: ${token}`);
    }
  }
  if (!args.market) {
    throw new Error("Missing required --market");
  }
  return args;
}

async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= tasks.length) {
        return;
      }
      results[currentIndex] = await tasks[currentIndex]();
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, tasks.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function materializeProfile(
  service: BacktestService,
  target: { workspace_id: string; profile_id: string },
  args: MaterializeMarketCliArgs,
): Promise<Record<string, unknown>> {
  const profile = getProfileDefinition(target.profile_id);
  if (!profile) {
    throw new Error(`Unknown profileId: ${target.profile_id}`);
  }
  const workspace = getWorkspaceDefinition(target.workspace_id) ?? getWorkspaceDefinition(profile.workspaceId);
  if (!workspace) {
    throw new Error(`Unknown workspaceId: ${target.workspace_id}`);
  }
  const csvPath = workspace.csvPath;
  const strategyExecutionModel = workspace.defaultStrategyExecutionModel;
  const strategyPriceBasis = workspace.defaultStrategyPriceBasis;
  const sweepExecutionModel = workspace.defaultSweepExecutionModel;
  const sweepPriceBasis = workspace.defaultSweepPriceBasis;

  const explorer = await service.strategyExplorer({
    profileId: profile.profileId,
    csvPath,
    executionModel: strategyExecutionModel,
    priceBasis: strategyPriceBasis,
  });
  const strategyIds = [...new Set(explorer.strategies.map((strategy) => strategy.strategy_id).filter(Boolean))];

  const ranking = await service.strategyRanking({
    profileId: profile.profileId,
    csvPath,
    executionModel: strategyExecutionModel,
    priceBasis: strategyPriceBasis,
    limit: 0,
  });

  for (const strategyId of strategyIds) {
    await service.strategyDetail({
      profileId: profile.profileId,
      csvPath,
      strategyId,
      executionModel: strategyExecutionModel,
      priceBasis: strategyPriceBasis,
    });
    await service.threadTimeline({
      profileId: profile.profileId,
      csvPath,
      strategyId,
      executionModel: strategyExecutionModel,
      priceBasis: strategyPriceBasis,
    });
  }

  const sweep = await service.materializeSweepArtifact({
    profileId: profile.profileId,
    csvPath,
    executionModel: sweepExecutionModel,
    priceBasis: sweepPriceBasis,
    maxWorkers: args.sweepMaxWorkers,
    chunkSize: args.sweepChunkSize,
  });

  let officialExplorer: Record<string, unknown> = { status: "SKIPPED" };
  let officialMatrix: Record<string, unknown> = { status: "SKIPPED" };
  if (workspace.referenceMode !== "backtest_only") {
    const officialExplorerPayload = await service.officialExplorer({
      profileId: profile.profileId,
      csvPath,
    });
    officialExplorer = {
      status: "COMPLETED",
      rankingCount: officialExplorerPayload.rankings.length,
      officialProfileId: officialExplorerPayload.meta.official_profile_id,
    };
    const officialMatrixPayload = await service.officialMatrix({
      profileId: profile.profileId,
      csvPath,
      threads: [5, 6, 7],
      stops: [30, 40],
    });
    officialMatrix = {
      status: "COMPLETED",
      comboCount: Object.keys(officialMatrixPayload.combos).length,
      officialProfileId: officialMatrixPayload.meta.official_profile_id,
    };
  }

  let regimeWalkForward: Record<string, unknown> = { status: "SKIPPED" };
  if (workspace.workspaceId === "soxl") {
    const regimeArtifact = await service.regimeWalkForward({
      profileId: profile.profileId,
      csvPath,
      maxWorkers: 1,
    });
    regimeWalkForward = {
      status: "COMPLETED",
      artifactId: regimeArtifact.artifactId,
      recommendation: regimeArtifact.payload.decision.recommendation,
    };
  }

  return {
    status: "COMPLETED",
    profileId: profile.profileId,
    workspaceId: workspace.workspaceId,
    symbol: profile.symbol,
    strategyExplorer: {
      status: "COMPLETED",
      catalogId: explorer.meta.catalog_id,
      strategyCount: strategyIds.length,
      rankingCount: explorer.rankings.length,
    },
    strategyRanking: {
      status: "COMPLETED",
      rowCount: ranking.rows.length,
      rankingBasis: ranking.meta.ranking_basis,
    },
    strategyDetails: {
      status: "COMPLETED",
      count: strategyIds.length,
    },
    threadTimelines: {
      status: "COMPLETED",
      count: strategyIds.length,
    },
    parameterSweep: {
      status: sweep.action,
      artifactId: sweep.artifact?.artifactId ?? null,
      comboCount: sweep.payload?.rows.length ?? null,
    },
    officialExplorer,
    officialMatrix,
    regimeWalkForward,
  };
}

async function main(): Promise<void> {
  const args = parseMaterializeMarketCliArgs(process.argv.slice(2));
  const definition = getMarketRefreshDefinition(args.market);
  const targets = resolveMarketMaterializationTargets(args.market, args.profileIds);
  const service = new BacktestService();
  const tasks = targets.map((target) => async () => {
    try {
      return await materializeProfile(service, target, args);
    } catch (error) {
      return {
        profileId: target.profile_id,
        workspaceId: target.workspace_id,
        status: "FAILED",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
  const results = await runWithConcurrency(tasks, args.maxWorkers);
  console.log(
    JSON.stringify(
      {
        requested_at: new Date().toISOString(),
        market: args.market,
        cron_timezone: definition.cron_timezone,
        cron_schedule: definition.cron_schedule,
        profile_count: targets.length,
        max_workers: Math.max(1, Math.min(args.maxWorkers, targets.length || 1)),
        results,
      },
      null,
      2,
    ),
  );
  if (results.some((result) => result.status === "FAILED")) {
    process.exitCode = 1;
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  void main();
}
