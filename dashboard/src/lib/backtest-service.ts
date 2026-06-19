import { createHash } from "node:crypto";

import { HttpError } from "./http.js";
import { getDataStatus } from "./data-service.js";
import { defaultCsvPath } from "./paths.js";
import { getProfileDefinition } from "./profiles.js";
import { runCliJson } from "./python.js";
import { getResearchStore, newResearchArtifactId } from "./research-store.js";
import {
  listJobs,
  listRunArtifacts,
  loadJob,
  loadMentorMatrixArtifact,
  loadRunArtifact,
  newJobId,
  saveJob,
  saveMentorMatrixArtifact,
  saveRunArtifact,
} from "./runtime-store.js";
import type {
  BacktestDetailPayload,
  BacktestOverrides,
  BacktestRiskPayload,
  DashboardJobRecord,
  GridCellPayload,
  MentorMatrixPayload,
  ParameterSweepPayload,
  PersistedRunArtifact,
  ProfilePayload,
  ProfileShowPayload,
  ResearchArtifactRecord,
  StrategyExplorerPayload,
} from "./types.js";

const STRATEGY_EXPLORER_VERSION = "strategy-explorer-v1";
const PARAMETER_SWEEP_VERSION = "parameter-sweep-v1";
const DEFAULT_RESEARCH_EXECUTION_MODEL = "next_open";
const DEFAULT_RESEARCH_PRICE_BASIS = "adjusted_close";
const DEFAULT_STRATEGY_CATALOG_ID = "core_profiles_v1";
const DEFAULT_SWEEP_ID = "core6_v1";

export interface BacktestJobInput {
  profileId: string;
  csvPath?: string;
  initialCapital?: number;
  overrides?: BacktestOverrides;
}

export interface CompareInput {
  profileId: string;
  csvPath?: string;
  initialCapital?: number;
  threads: number[];
  stops: number[];
  overrides?: BacktestOverrides;
}

export interface MentorMatrixInput {
  profileId: string;
  csvPath?: string;
  initialCapital?: number;
  threads: number[];
  stops: number[];
  overrides?: BacktestOverrides;
}

export interface StrategyExplorerInput {
  profileId: string;
  csvPath?: string;
  initialCapital?: number;
  catalogId?: string;
  executionModel?: string;
  priceBasis?: string;
}

export interface SweepJobInput {
  profileId: string;
  csvPath?: string;
  initialCapital?: number;
  sweepId?: string;
  executionModel?: string;
  priceBasis?: string;
}

function buildOverrideArgs(
  overrides?: BacktestOverrides,
  options: { includeThreadCount?: boolean; includeStopSessions?: boolean } = {},
): string[] {
  if (!overrides) {
    return [];
  }
  const args: string[] = [];
  const includeThreadCount = options.includeThreadCount ?? true;
  const includeStopSessions = options.includeStopSessions ?? true;
  if (includeThreadCount && overrides.threadCount != null) {
    args.push("--thread-count", String(overrides.threadCount));
  }
  if (includeStopSessions && overrides.stopSessions != null) {
    args.push("--stop-sessions", String(overrides.stopSessions));
  }
  if (overrides.takeProfitPct != null) {
    args.push("--take-profit-pct", String(overrides.takeProfitPct));
  }
  if (overrides.takeProfitOperator) {
    args.push("--take-profit-operator", overrides.takeProfitOperator);
  }
  if (overrides.entryDropPct != null) {
    args.push("--entry-drop-pct", String(overrides.entryDropPct));
  }
  if (overrides.stopLossPct != null) {
    args.push("--stop-loss-pct", String(overrides.stopLossPct));
  }
  if (overrides.maxEntriesPerSession != null) {
    args.push("--max-entries-per-session", String(overrides.maxEntriesPerSession));
  }
  if (overrides.sizingMode) {
    args.push("--sizing-mode", overrides.sizingMode);
  }
  if (overrides.priceBasis) {
    args.push("--price-basis", overrides.priceBasis);
  }
  return args;
}

function buildResearchArgs(input: {
  catalogId?: string;
  sweepId?: string;
  executionModel?: string;
  priceBasis?: string;
}): string[] {
  const args: string[] = [];
  if (input.catalogId) {
    args.push("--catalog-id", input.catalogId);
  }
  if (input.sweepId) {
    args.push("--sweep-id", input.sweepId);
  }
  args.push("--execution-model", input.executionModel ?? DEFAULT_RESEARCH_EXECUTION_MODEL);
  args.push("--price-basis", input.priceBasis ?? DEFAULT_RESEARCH_PRICE_BASIS);
  return args;
}

function resolveProfilePayload(staticProfileId: string, initialCapital: number, overrides?: BacktestOverrides): Promise<ProfilePayload> {
  const profile = getProfileDefinition(staticProfileId);
  if (!profile) {
    throw new HttpError(404, `Unknown profileId: ${staticProfileId}`);
  }
  return runCliJson<ProfileShowPayload>([
    "profile",
    "show",
    "--profile",
    profile.profilePath,
    "--initial-capital",
    String(initialCapital),
    ...buildOverrideArgs(overrides),
  ]).then((payload) => ({
    ...profile,
    configHash: payload.config_hash as string,
    initialCapital: payload.initial_capital as string,
  }));
}

function tradesToCsv(run: BacktestDetailPayload): string {
  const header = [
    "thread_id",
    "signal_date",
    "fill_entry_date",
    "entry_price",
    "shares",
    "invested_amount",
    "exit_signal_date",
    "fill_exit_date",
    "exit_price",
    "holding_sessions",
    "pnl",
    "return_pct",
    "close_reason",
  ];
  const rows = run.trades.map((trade) =>
    [
      trade.thread_id,
      trade.signal_date,
      trade.fill_entry_date,
      trade.entry_price,
      trade.shares,
      trade.invested_amount,
      trade.exit_signal_date ?? "",
      trade.fill_exit_date ?? "",
      trade.exit_price ?? "",
      trade.holding_sessions ?? "",
      trade.pnl,
      trade.return_pct,
      trade.close_reason ?? "",
    ]
      .map((value) => {
        const text = String(value ?? "");
        return `"${text.replaceAll("\"", "\"\"")}"`;
      })
      .join(","),
  );
  return `${header.join(",")}\n${rows.join("\n")}\n`;
}

function summarizeArtifact(artifact: PersistedRunArtifact): Record<string, unknown> {
  return {
    runId: artifact.runId,
    profileId: artifact.profileId,
    symbol: artifact.symbol,
    csvPath: artifact.csvPath,
    createdAt: artifact.createdAt,
    dataHash: artifact.dataHash,
    configHash: artifact.configHash,
    metrics: artifact.payload.metrics,
    yearly: artifact.payload.yearly,
  };
}

function shortDigest(parts: Array<string | number | undefined | null>): string {
  const raw = parts.map((part) => String(part ?? "")).join(":");
  return createHash("sha256").update(raw).digest("hex");
}

function makeStrategyArtifactKey(input: {
  profileId: string;
  csvPath: string;
  dataHash: string;
  initialCapital: number;
  executionModel: string;
  priceBasis: string;
  catalogId: string;
}): string {
  return shortDigest([
    STRATEGY_EXPLORER_VERSION,
    input.profileId,
    input.csvPath,
    input.dataHash,
    input.initialCapital,
    input.executionModel,
    input.priceBasis,
    input.catalogId,
  ]);
}

function makeSweepArtifactKey(input: {
  profileId: string;
  csvPath: string;
  dataHash: string;
  initialCapital: number;
  executionModel: string;
  priceBasis: string;
  sweepId: string;
}): string {
  return shortDigest([
    PARAMETER_SWEEP_VERSION,
    input.profileId,
    input.csvPath,
    input.dataHash,
    input.initialCapital,
    input.executionModel,
    input.priceBasis,
    input.sweepId,
  ]);
}

async function saveStrategyArtifact(
  payload: StrategyExplorerPayload,
  input: {
    artifactKey: string;
    profileId: string;
    symbol: string;
    csvPath: string;
  },
): Promise<ResearchArtifactRecord<StrategyExplorerPayload>> {
  const store = await getResearchStore();
  return store.saveArtifact<StrategyExplorerPayload>({
    artifactId: newResearchArtifactId(),
    artifactKey: input.artifactKey,
    kind: "STRATEGY_EXPLORER",
    profileId: input.profileId,
    symbol: input.symbol,
    csvPath: input.csvPath,
    executionModel: payload.meta.execution_model,
    priceBasis: payload.meta.price_basis,
    dataHash: payload.meta.data_hash,
    codeCommit: payload.meta.code_commit,
    createdAt: new Date().toISOString(),
    catalogId: payload.meta.catalog_id,
    catalogHash: payload.meta.catalog_hash,
    payloadHash: payload.meta.catalog_hash,
    payload,
  });
}

async function saveSweepArtifact(
  payload: ParameterSweepPayload,
  input: {
    artifactKey: string;
    profileId: string;
    symbol: string;
    csvPath: string;
  },
): Promise<ResearchArtifactRecord<ParameterSweepPayload>> {
  const store = await getResearchStore();
  return store.saveArtifact<ParameterSweepPayload>(
    {
      artifactId: newResearchArtifactId(),
      artifactKey: input.artifactKey,
      kind: "PARAMETER_SWEEP",
      profileId: input.profileId,
      symbol: input.symbol,
      csvPath: input.csvPath,
      executionModel: payload.meta.execution_model,
      priceBasis: payload.meta.price_basis,
      dataHash: payload.meta.data_hash,
      codeCommit: payload.meta.code_commit,
      createdAt: new Date().toISOString(),
      sweepId: payload.meta.sweep_id,
      sweepHash: payload.meta.sweep_hash,
      payloadHash: payload.payload_hash,
      payload,
    },
    payload.rows,
  );
}

export class BacktestService {
  private readonly queuedJobIds = new Set<string>();
  private running = false;

  async createJob(input: BacktestJobInput): Promise<DashboardJobRecord> {
    const initialCapital = input.initialCapital ?? 10000;
    const profile = getProfileDefinition(input.profileId);
    if (!profile) {
      throw new HttpError(404, `Unknown profileId: ${input.profileId}`);
    }
    const csvPath = input.csvPath ?? defaultCsvPath;
    const [profilePayload, dataStatus] = await Promise.all([
      resolveProfilePayload(input.profileId, initialCapital, input.overrides),
      getDataStatus(csvPath, profile.symbol),
    ]);
    const job: DashboardJobRecord = {
      jobId: newJobId(),
      kind: "BACKTEST",
      status: "QUEUED",
      profileId: input.profileId,
      symbol: profile.symbol,
      csvPath,
      initialCapital,
      configHash: profilePayload.configHash,
      dataHash: dataStatus.data_hash,
      requestedAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      progress: 0,
      runId: null,
      artifactId: null,
      error: null,
      overrides: input.overrides,
    };
    await saveJob(job);
    this.queuedJobIds.add(job.jobId);
    void this.drainQueue();
    return job;
  }

  async createSweepJob(input: SweepJobInput): Promise<DashboardJobRecord> {
    const initialCapital = input.initialCapital ?? 10000;
    const profile = getProfileDefinition(input.profileId);
    if (!profile) {
      throw new HttpError(404, `Unknown profileId: ${input.profileId}`);
    }
    const csvPath = input.csvPath ?? defaultCsvPath;
    const executionModel = input.executionModel ?? DEFAULT_RESEARCH_EXECUTION_MODEL;
    const priceBasis = input.priceBasis ?? DEFAULT_RESEARCH_PRICE_BASIS;
    const sweepId = input.sweepId ?? DEFAULT_SWEEP_ID;
    const [profilePayload, dataStatus, store] = await Promise.all([
      resolveProfilePayload(input.profileId, initialCapital),
      getDataStatus(csvPath, profile.symbol),
      getResearchStore(),
    ]);
    const artifactKey = makeSweepArtifactKey({
      profileId: input.profileId,
      csvPath,
      dataHash: dataStatus.data_hash,
      initialCapital,
      executionModel,
      priceBasis,
      sweepId,
    });
    const cached = await store.findByKey<ParameterSweepPayload>(artifactKey);
    const now = new Date().toISOString();
    const job: DashboardJobRecord = {
      jobId: newJobId(),
      kind: "BACKTEST_SWEEP",
      status: cached ? "COMPLETED" : "QUEUED",
      profileId: input.profileId,
      symbol: profile.symbol,
      csvPath,
      initialCapital,
      configHash: profilePayload.configHash,
      dataHash: dataStatus.data_hash,
      requestedAt: now,
      startedAt: cached ? now : null,
      finishedAt: cached ? now : null,
      progress: cached ? 100 : 0,
      runId: null,
      artifactId: cached?.artifactId ?? null,
      error: null,
      sweepId,
      executionModel,
      priceBasis,
    };
    await saveJob(job);
    if (!cached) {
      this.queuedJobIds.add(job.jobId);
      void this.drainQueue();
    }
    return job;
  }

  async strategyExplorer(input: StrategyExplorerInput): Promise<StrategyExplorerPayload> {
    const initialCapital = input.initialCapital ?? 10000;
    const profile = getProfileDefinition(input.profileId);
    if (!profile) {
      throw new HttpError(404, `Unknown profileId: ${input.profileId}`);
    }
    const csvPath = input.csvPath ?? defaultCsvPath;
    const catalogId = input.catalogId ?? DEFAULT_STRATEGY_CATALOG_ID;
    const executionModel = input.executionModel ?? DEFAULT_RESEARCH_EXECUTION_MODEL;
    const priceBasis = input.priceBasis ?? DEFAULT_RESEARCH_PRICE_BASIS;
    const [dataStatus, store] = await Promise.all([getDataStatus(csvPath, profile.symbol), getResearchStore()]);
    const artifactKey = makeStrategyArtifactKey({
      profileId: input.profileId,
      csvPath,
      dataHash: dataStatus.data_hash,
      initialCapital,
      executionModel,
      priceBasis,
      catalogId,
    });
    const cached = await store.findByKey<StrategyExplorerPayload>(artifactKey);
    if (cached) {
      return cached.payload;
    }
    const payload = await runCliJson<StrategyExplorerPayload>([
      "backtest",
      "strategy-explorer",
      "--profile",
      profile.profilePath,
      "--csv",
      csvPath,
      "--symbol",
      profile.symbol,
      "--initial-capital",
      String(initialCapital),
      ...buildResearchArgs({ catalogId, executionModel, priceBasis }),
    ]);
    await saveStrategyArtifact(payload, {
      artifactKey,
      profileId: input.profileId,
      symbol: profile.symbol,
      csvPath,
    });
    return payload;
  }

  async getLatestSweep(input: SweepJobInput): Promise<ResearchArtifactRecord<ParameterSweepPayload> | null> {
    const profile = getProfileDefinition(input.profileId);
    if (!profile) {
      throw new HttpError(404, `Unknown profileId: ${input.profileId}`);
    }
    const csvPath = input.csvPath ?? defaultCsvPath;
    const executionModel = input.executionModel ?? DEFAULT_RESEARCH_EXECUTION_MODEL;
    const priceBasis = input.priceBasis ?? DEFAULT_RESEARCH_PRICE_BASIS;
    const sweepId = input.sweepId ?? DEFAULT_SWEEP_ID;
    const [dataStatus, store] = await Promise.all([getDataStatus(csvPath, profile.symbol), getResearchStore()]);
    return store.loadLatestSweep<ParameterSweepPayload>({
      sweepId,
      csvPath,
      executionModel,
      priceBasis,
      dataHash: dataStatus.data_hash,
    });
  }

  async getSweepArtifact(artifactId: string): Promise<ResearchArtifactRecord<ParameterSweepPayload>> {
    const store = await getResearchStore();
    const artifact = await store.loadArtifact<ParameterSweepPayload>(artifactId);
    if (!artifact) {
      throw new HttpError(404, `Unknown sweep artifactId: ${artifactId}`);
    }
    return artifact;
  }

  async getJob(jobId: string): Promise<DashboardJobRecord> {
    const job = await loadJob(jobId);
    if (!job) {
      throw new HttpError(404, `Unknown jobId: ${jobId}`);
    }
    return job;
  }

  async getRun(runId: string): Promise<PersistedRunArtifact> {
    const run = await loadRunArtifact(runId);
    if (!run) {
      throw new HttpError(404, `Unknown runId: ${runId}`);
    }
    return run;
  }

  async getRunTradesCsv(runId: string): Promise<string> {
    const artifact = await this.getRun(runId);
    return tradesToCsv(artifact.payload);
  }

  async getOverview(): Promise<{
    jobs: DashboardJobRecord[];
    runs: Array<Record<string, unknown>>;
    latestRun: PersistedRunArtifact | null;
  }> {
    const [jobs, runs] = await Promise.all([listJobs(12), listRunArtifacts(6)]);
    return {
      jobs,
      runs: runs.map((artifact) => summarizeArtifact(artifact)),
      latestRun: runs[0] ?? null,
    };
  }

  async compare(input: CompareInput): Promise<{
    profileId: string;
    csvPath: string;
    requestedAt: string;
    configHash: string;
    dataHash: string;
    threadCounts: number[];
    stopSessions: number[];
    cells: GridCellPayload[];
  }> {
    const initialCapital = input.initialCapital ?? 10000;
    const profile = getProfileDefinition(input.profileId);
    if (!profile) {
      throw new HttpError(404, `Unknown profileId: ${input.profileId}`);
    }
    const csvPath = input.csvPath ?? defaultCsvPath;
    const [profilePayload, dataStatus, cells] = await Promise.all([
      resolveProfilePayload(input.profileId, initialCapital, input.overrides),
      getDataStatus(csvPath, profile.symbol),
      runCliJson<GridCellPayload[]>([
        "backtest",
        "grid",
        "--profile",
        profile.profilePath,
        "--csv",
        csvPath,
        "--symbol",
        profile.symbol,
        "--threads",
        input.threads.join(","),
        "--stops",
        input.stops.join(","),
        "--initial-capital",
        String(initialCapital),
        ...buildOverrideArgs(input.overrides, { includeThreadCount: false, includeStopSessions: false }),
      ]),
    ]);
    return {
      profileId: input.profileId,
      csvPath,
      requestedAt: new Date().toISOString(),
      configHash: profilePayload.configHash,
      dataHash: dataStatus.data_hash,
      threadCounts: input.threads,
      stopSessions: input.stops,
      cells,
    };
  }

  async mentorMatrix(input: MentorMatrixInput): Promise<MentorMatrixPayload> {
    const initialCapital = input.initialCapital ?? 10000;
    const profile = getProfileDefinition(input.profileId);
    if (!profile) {
      throw new HttpError(404, `Unknown profileId: ${input.profileId}`);
    }
    const csvPath = input.csvPath ?? defaultCsvPath;
    const [profilePayload, dataStatus] = await Promise.all([
      resolveProfilePayload(input.profileId, initialCapital, input.overrides),
      getDataStatus(csvPath, profile.symbol),
    ]);
    const cacheKey = [
      "mentor-matrix",
      input.profileId,
      profilePayload.configHash,
      dataStatus.data_hash,
      input.threads.join(","),
      input.stops.join(","),
    ].join(":");
    const cached = await loadMentorMatrixArtifact<MentorMatrixPayload>(cacheKey);
    if (cached) {
      return cached;
    }
    const payload = await runCliJson<MentorMatrixPayload>([
      "backtest",
      "mentor-matrix",
      "--profile",
      profile.profilePath,
      "--csv",
      csvPath,
      "--symbol",
      profile.symbol,
      "--threads",
      input.threads.join(","),
      "--stops",
      input.stops.join(","),
      "--initial-capital",
      String(initialCapital),
      ...buildOverrideArgs(input.overrides, { includeThreadCount: false, includeStopSessions: false }),
    ]);
    await saveMentorMatrixArtifact(cacheKey, payload);
    return payload;
  }

  async riskReport(input: {
    profileId: string;
    csvPath?: string;
    initialCapital?: number;
    overrides?: BacktestOverrides;
  }): Promise<BacktestRiskPayload> {
    const initialCapital = input.initialCapital ?? 10000;
    const profile = getProfileDefinition(input.profileId);
    if (!profile) {
      throw new HttpError(404, `Unknown profileId: ${input.profileId}`);
    }
    const csvPath = input.csvPath ?? defaultCsvPath;
    return runCliJson<BacktestRiskPayload>([
      "backtest",
      "risk-report",
      "--profile",
      profile.profilePath,
      "--csv",
      csvPath,
      "--symbol",
      profile.symbol,
      "--initial-capital",
      String(initialCapital),
      ...buildOverrideArgs(input.overrides),
    ]);
  }

  private async drainQueue(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      while (this.queuedJobIds.size > 0) {
        const [jobId] = this.queuedJobIds;
        this.queuedJobIds.delete(jobId);
        await this.executeJob(jobId);
      }
    } finally {
      this.running = false;
      if (this.queuedJobIds.size > 0) {
        void this.drainQueue();
      }
    }
  }

  private async executeJob(jobId: string): Promise<void> {
    const job = await loadJob(jobId);
    if (!job || job.status !== "QUEUED") {
      return;
    }
    if (job.kind === "BACKTEST_SWEEP") {
      await this.executeSweepJob(job);
      return;
    }
    await this.executeBacktestJob(job);
  }

  private async executeBacktestJob(job: DashboardJobRecord): Promise<void> {
    const profile = getProfileDefinition(job.profileId);
    if (!profile) {
      job.status = "FAILED";
      job.error = `Unknown profileId: ${job.profileId}`;
      job.finishedAt = new Date().toISOString();
      job.progress = 100;
      await saveJob(job);
      return;
    }
    job.status = "RUNNING";
    job.startedAt = new Date().toISOString();
    job.progress = 15;
    await saveJob(job);

    try {
      const payload = await runCliJson<BacktestDetailPayload>([
        "backtest",
        "detail",
        "--profile",
        profile.profilePath,
        "--csv",
        job.csvPath,
        "--symbol",
        job.symbol,
        "--initial-capital",
        String(job.initialCapital),
        ...buildOverrideArgs(job.overrides),
      ]);
      const artifact: PersistedRunArtifact = {
        runId: payload.run_id,
        profileId: job.profileId,
        symbol: job.symbol,
        csvPath: job.csvPath,
        createdAt: new Date().toISOString(),
        dataHash: payload.data_hash,
        configHash: payload.config_hash,
        payload,
      };
      await saveRunArtifact(artifact);
      job.status = "COMPLETED";
      job.progress = 100;
      job.finishedAt = new Date().toISOString();
      job.runId = payload.run_id;
      job.error = null;
      await saveJob(job);
    } catch (error) {
      job.status = "FAILED";
      job.progress = 100;
      job.finishedAt = new Date().toISOString();
      job.error = error instanceof Error ? error.message : "Unknown backtest failure";
      await saveJob(job);
    }
  }

  private async executeSweepJob(job: DashboardJobRecord): Promise<void> {
    const profile = getProfileDefinition(job.profileId);
    if (!profile) {
      job.status = "FAILED";
      job.error = `Unknown profileId: ${job.profileId}`;
      job.finishedAt = new Date().toISOString();
      job.progress = 100;
      await saveJob(job);
      return;
    }
    const sweepId = job.sweepId ?? DEFAULT_SWEEP_ID;
    const executionModel = job.executionModel ?? DEFAULT_RESEARCH_EXECUTION_MODEL;
    const priceBasis = job.priceBasis ?? DEFAULT_RESEARCH_PRICE_BASIS;
    job.status = "RUNNING";
    job.startedAt = new Date().toISOString();
    job.progress = 10;
    await saveJob(job);

    try {
      const dataStatus = await getDataStatus(job.csvPath, profile.symbol);
      const artifactKey = makeSweepArtifactKey({
        profileId: job.profileId,
        csvPath: job.csvPath,
        dataHash: dataStatus.data_hash,
        initialCapital: job.initialCapital,
        executionModel,
        priceBasis,
        sweepId,
      });
      const payload = await runCliJson<ParameterSweepPayload>([
        "backtest",
        "parameter-sweep",
        "--profile",
        profile.profilePath,
        "--csv",
        job.csvPath,
        "--symbol",
        job.symbol,
        "--initial-capital",
        String(job.initialCapital),
        ...buildResearchArgs({ sweepId, executionModel, priceBasis }),
      ]);
      const artifact = await saveSweepArtifact(payload, {
        artifactKey,
        profileId: job.profileId,
        symbol: job.symbol,
        csvPath: job.csvPath,
      });
      job.status = "COMPLETED";
      job.progress = 100;
      job.finishedAt = new Date().toISOString();
      job.artifactId = artifact.artifactId;
      job.error = null;
      await saveJob(job);
    } catch (error) {
      job.status = "FAILED";
      job.progress = 100;
      job.finishedAt = new Date().toISOString();
      job.error = error instanceof Error ? error.message : "Unknown sweep failure";
      await saveJob(job);
    }
  }
}
