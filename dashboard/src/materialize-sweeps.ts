import { pathToFileURL } from "node:url";

import { BacktestService, type SweepMaterializationInput, type SweepMaterializationResult } from "./lib/backtest-service.js";
import { getProfileDefinition } from "./lib/profiles.js";
import { defaultWorkspaceDefinition, getWorkspaceDefinition, listWorkspaceDefinitions } from "./lib/workspaces.js";

export interface MaterializeSweepsCliArgs {
  workspaceIds: string[];
  profileIds: string[];
  allWorkspaces: boolean;
  sweepId: string;
  executionModel?: string;
  priceBasis?: string;
  initialCapital?: number;
  maxWorkers?: number;
  chunkSize?: number;
  batchConcurrency: number;
  force: boolean;
  dryRun: boolean;
}

export interface SweepMaterializationTarget {
  workspaceId: string | null;
  profileId: string;
}

function printHelp(): void {
  console.log(
    [
      "usage: node dashboard/dist/materialize-sweeps.js [options]",
      "",
      "options:",
      "  --workspace <id[,id...]>       materialize default profile sweeps for one or more workspaces",
      "  --profile-id <id[,id...]>      materialize one or more explicit profile sweeps",
      "  --all-workspaces               materialize default profile sweeps for every workspace",
      "  --sweep-id <id>                sweep id to materialize (default: core4_v4)",
      "  --execution-model <id>         override execution model",
      "  --price-basis <id>             override price basis",
      "  --initial-capital <number>     override initial capital",
      "  --max-workers <number>         engine sweep worker limit",
      "  --chunk-size <number>          engine sweep chunk size",
      "  --batch-concurrency <number>   concurrent workspace/profile materializations",
      "  --force                        rebuild even if a reusable artifact already exists",
      "  --dry-run                      print sweep execution plan without saving an artifact",
    ].join("\n"),
  );
}

function parseCsvOption(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePositiveNumber(value: string, fieldName: string, options: { integer?: boolean } = {}): number {
  const integer = options.integer ?? false;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || (integer && !Number.isInteger(parsed))) {
    throw new Error(`Invalid ${fieldName}: ${value}`);
  }
  return parsed;
}

export function parseMaterializeSweepsCliArgs(argv: string[]): MaterializeSweepsCliArgs {
  const args: MaterializeSweepsCliArgs = {
    workspaceIds: [],
    profileIds: [],
    allWorkspaces: false,
    sweepId: "core4_v4",
    batchConcurrency: 1,
    force: false,
    dryRun: false,
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
      case "--workspace":
        args.workspaceIds.push(...parseCsvOption(nextValue()));
        break;
      case "--profile-id":
        args.profileIds.push(...parseCsvOption(nextValue()));
        break;
      case "--all-workspaces":
        args.allWorkspaces = true;
        break;
      case "--sweep-id":
        args.sweepId = nextValue();
        break;
      case "--execution-model":
        args.executionModel = nextValue();
        break;
      case "--price-basis":
        args.priceBasis = nextValue();
        break;
      case "--initial-capital":
        args.initialCapital = parsePositiveNumber(nextValue(), "initial-capital");
        break;
      case "--max-workers":
        args.maxWorkers = parsePositiveNumber(nextValue(), "max-workers", { integer: true });
        break;
      case "--chunk-size":
        args.chunkSize = parsePositiveNumber(nextValue(), "chunk-size", { integer: true });
        break;
      case "--batch-concurrency":
        args.batchConcurrency = parsePositiveNumber(nextValue(), "batch-concurrency", { integer: true });
        break;
      case "--force":
        args.force = true;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown option: ${token}`);
    }
  }
  return args;
}

export function resolveSweepMaterializationTargets(args: MaterializeSweepsCliArgs): SweepMaterializationTarget[] {
  const targets = new Map<string, SweepMaterializationTarget>();
  const addTarget = (target: SweepMaterializationTarget): void => {
    targets.set(target.profileId, target);
  };

  if (args.allWorkspaces) {
    for (const workspace of listWorkspaceDefinitions()) {
      addTarget({ workspaceId: workspace.workspaceId, profileId: workspace.defaultProfileId });
    }
  }
  for (const workspaceId of args.workspaceIds) {
    const workspace = getWorkspaceDefinition(workspaceId);
    if (!workspace) {
      throw new Error(`Unknown workspace: ${workspaceId}`);
    }
    addTarget({ workspaceId: workspace.workspaceId, profileId: workspace.defaultProfileId });
  }
  for (const profileId of args.profileIds) {
    const profile = getProfileDefinition(profileId);
    if (!profile) {
      throw new Error(`Unknown profileId: ${profileId}`);
    }
    addTarget({ workspaceId: profile.workspaceId, profileId });
  }
  if (targets.size === 0) {
    const fallbackWorkspace = defaultWorkspaceDefinition();
    addTarget({ workspaceId: fallbackWorkspace.workspaceId, profileId: fallbackWorkspace.defaultProfileId });
  }
  return [...targets.values()];
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

function summarizeMaterializationResult(
  target: SweepMaterializationTarget,
  result: SweepMaterializationResult,
): Record<string, unknown> {
  const meta =
    result.payload?.meta
    ?? (result.artifact?.payload?.meta as Record<string, unknown> | undefined)
    ?? ((result.plan?.meta as Record<string, unknown> | undefined) || undefined);
  return {
    workspaceId: target.workspaceId,
    profileId: target.profileId,
    action: result.action,
    artifactId: result.artifact?.artifactId ?? null,
    artifactKey: result.artifactKey,
    sweepId: meta?.sweep_id ?? null,
    symbol: meta?.symbol ?? result.artifact?.symbol ?? null,
    comboCount: meta?.combo_count ?? null,
    workerCount: meta?.worker_count ?? null,
    chunkCount: meta?.chunk_count ?? null,
    chunkSize: meta?.chunk_size ?? null,
    codeCommit: meta?.code_commit ?? result.artifact?.codeCommit ?? null,
  };
}

async function main(): Promise<void> {
  const args = parseMaterializeSweepsCliArgs(process.argv.slice(2));
  const targets = resolveSweepMaterializationTargets(args);
  const service = new BacktestService();
  const tasks = targets.map((target) => async () => {
    try {
      const result = await service.materializeSweepArtifact({
        profileId: target.profileId,
        initialCapital: args.initialCapital,
        sweepId: args.sweepId,
        executionModel: args.executionModel,
        priceBasis: args.priceBasis,
        maxWorkers: args.maxWorkers,
        chunkSize: args.chunkSize,
        force: args.force,
        dryRun: args.dryRun,
      } satisfies SweepMaterializationInput);
      return summarizeMaterializationResult(target, result);
    } catch (error) {
      return {
        workspaceId: target.workspaceId,
        profileId: target.profileId,
        action: "FAILED",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
  const results: Array<Record<string, unknown>> = await runWithConcurrency(tasks, args.batchConcurrency);
  console.log(
    JSON.stringify(
      {
        requested_at: new Date().toISOString(),
        batch_concurrency: Math.max(1, Math.min(args.batchConcurrency, targets.length)),
        results,
      },
      null,
      2,
    ),
  );
  if (results.some((row) => row.action === "FAILED")) {
    process.exitCode = 1;
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  void main();
}
