import { HttpError } from "./http.js";
import { getDataStatus } from "./data-service.js";
import { defaultCsvPath } from "./paths.js";
import { getProfileDefinition } from "./profiles.js";
import { runCliJson } from "./python.js";
import {
  listJobs,
  listRunArtifacts,
  loadJob,
  loadRunArtifact,
  newJobId,
  saveJob,
  saveRunArtifact,
} from "./runtime-store.js";
import type {
  BacktestDetailPayload,
  DashboardJobRecord,
  GridCellPayload,
  PersistedRunArtifact,
  ProfilePayload,
  ProfileShowPayload,
} from "./types.js";

export interface BacktestJobInput {
  profileId: string;
  csvPath?: string;
  initialCapital?: number;
}

export interface CompareInput {
  profileId: string;
  csvPath?: string;
  initialCapital?: number;
  threads: number[];
  stops: number[];
}

function resolveProfilePayload(staticProfileId: string, initialCapital: number): Promise<ProfilePayload> {
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
      resolveProfilePayload(input.profileId, initialCapital),
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
      error: null,
    };
    await saveJob(job);
    this.queuedJobIds.add(job.jobId);
    void this.drainQueue();
    return job;
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
      resolveProfilePayload(input.profileId, initialCapital),
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
}
