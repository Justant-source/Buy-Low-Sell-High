import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import readline from "node:readline";

import { CliInvocationError, cliEnv, resolvePythonBinary } from "./python.js";
import { repoRoot } from "./paths.js";
import type { StrategyRankingPayload } from "./types.js";

interface StrategyRankingDaemonRequestPayload {
  profilePath: string;
  csvPath: string;
  symbol: string;
  initialCapital: number;
  executionModel: string;
  priceBasis: string;
  sliceStart?: string;
  sliceEnd?: string;
  limit: number;
}

interface StrategyRankingDaemonResponse {
  request_id: string;
  ok: boolean;
  payload?: StrategyRankingPayload;
  error?: string;
  detail?: string;
}

type PendingRequest = {
  resolve: (payload: StrategyRankingPayload) => void;
  reject: (error: Error) => void;
};

const STRATEGY_RANKING_MAX_WORKERS = 8;
const STRATEGY_RANKING_IDLE_TIMEOUT_SECONDS = 3600;

class StrategyRankingDaemonClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private reader: readline.Interface | null = null;
  private pending = new Map<string, PendingRequest>();
  private starting: Promise<void> | null = null;
  private stderrBuffer = "";

  async request(payload: StrategyRankingDaemonRequestPayload): Promise<StrategyRankingPayload> {
    await this.ensureStarted();
    const child = this.child;
    if (!child || !child.stdin.writable) {
      throw new Error("Strategy ranking daemon stdin is not writable");
    }
    const requestId = randomUUID();
    const envelope = {
      request_id: requestId,
      payload: {
        profile_path: payload.profilePath,
        csv_path: payload.csvPath,
        symbol: payload.symbol,
        initial_capital: payload.initialCapital,
        execution_model: payload.executionModel,
        price_basis: payload.priceBasis,
        slice_start: payload.sliceStart,
        slice_end: payload.sliceEnd,
        limit: payload.limit,
      },
    };
    return new Promise<StrategyRankingPayload>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      child.stdin.write(`${JSON.stringify(envelope)}\n`, "utf-8", (error) => {
        if (!error) {
          return;
        }
        this.pending.delete(requestId);
        reject(error);
      });
    });
  }

  private async ensureStarted(): Promise<void> {
    if (this.child && !this.child.killed) {
      return;
    }
    if (this.starting) {
      return this.starting;
    }
    this.starting = new Promise<void>((resolve, reject) => {
      const child = spawn(
        resolvePythonBinary(),
        [
          "-m",
          "buy_low_sell_high.cli",
          "worker",
          "strategy-ranking-daemon",
          "--max-workers",
          String(STRATEGY_RANKING_MAX_WORKERS),
          "--idle-timeout-seconds",
          String(STRATEGY_RANKING_IDLE_TIMEOUT_SECONDS),
        ],
        {
          cwd: repoRoot,
          env: cliEnv(),
          stdio: ["pipe", "pipe", "pipe"],
        },
      ) as ChildProcessWithoutNullStreams;
      this.child = child;
      this.stderrBuffer = "";
      this.reader = readline.createInterface({ input: child.stdout });
      this.reader.on("line", (line) => {
        this.handleResponse(line);
      });
      child.stderr.on("data", (chunk: Buffer | string) => {
        this.stderrBuffer += chunk.toString();
        if (this.stderrBuffer.length > 8000) {
          this.stderrBuffer = this.stderrBuffer.slice(-8000);
        }
      });
      child.once("spawn", () => {
        resolve();
      });
      child.once("error", (error) => {
        this.resetChild();
        reject(error);
      });
      child.once("exit", (code, signal) => {
        const message = `Strategy ranking daemon exited (code=${code ?? "null"}, signal=${signal ?? "null"})`;
        const error = new CliInvocationError(message, code, "", this.stderrBuffer);
        this.rejectAllPending(error);
        this.resetChild();
      });
    }).finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private handleResponse(line: string): void {
    let payload: StrategyRankingDaemonResponse;
    try {
      payload = JSON.parse(line) as StrategyRankingDaemonResponse;
    } catch (error) {
      this.rejectAllPending(
        new CliInvocationError(
          `Strategy ranking daemon returned invalid JSON: ${(error as Error).message}`,
          0,
          line,
          this.stderrBuffer,
        ),
      );
      return;
    }
    const pending = this.pending.get(payload.request_id);
    if (!pending) {
      return;
    }
    this.pending.delete(payload.request_id);
    if (payload.ok && payload.payload) {
      pending.resolve(payload.payload);
      return;
    }
    pending.reject(
      new CliInvocationError(
        payload.detail || payload.error || "Strategy ranking daemon request failed",
        0,
        line,
        this.stderrBuffer,
      ),
    );
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }

  private resetChild(): void {
    this.reader?.close();
    this.reader = null;
    this.child = null;
  }
}

const singleton = new StrategyRankingDaemonClient();

export function requestStrategyRankingFromDaemon(
  payload: StrategyRankingDaemonRequestPayload,
): Promise<StrategyRankingPayload> {
  return singleton.request(payload);
}
