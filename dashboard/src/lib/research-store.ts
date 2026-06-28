import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { Pool } from "pg";
import initSqlJs from "sql.js";

import type {
  ParameterSweepPayload,
  ParameterSweepRowPayload,
  ResearchArtifactKind,
  ResearchArtifactRecord,
} from "./types.js";
import { workspaceWarmupEnabled } from "./workspaces.js";

type AnyArtifactPayload = ParameterSweepPayload | Record<string, unknown>;
type SqliteBindValue = string | number | Uint8Array | null;

interface LatestSweepFilter {
  sweepId: string;
  csvPath: string;
  executionModel: string;
  priceBasis: string;
  dataHash: string;
}

export interface ResearchStore {
  findByKey<TPayload>(artifactKey: string): Promise<ResearchArtifactRecord<TPayload> | null>;
  loadArtifact<TPayload>(artifactId: string): Promise<ResearchArtifactRecord<TPayload> | null>;
  loadLatestSweep<TPayload>(filter: LatestSweepFilter): Promise<ResearchArtifactRecord<TPayload> | null>;
  saveArtifact<TPayload>(
    artifact: ResearchArtifactRecord<TPayload>,
    sweepRows?: ParameterSweepRowPayload[],
  ): Promise<ResearchArtifactRecord<TPayload>>;
}

const require = createRequire(import.meta.url);
const SQLITE_WASM_PATH = require.resolve("sql.js/dist/sql-wasm.wasm");
let SQLITE_MAX_LOAD_BYTES = 2 * 1024 * 1024 * 1024 - 1;

function parseArtifactPayload(payload: unknown): AnyArtifactPayload {
  if (typeof payload === "string") {
    return JSON.parse(payload) as AnyArtifactPayload;
  }
  return payload as AnyArtifactPayload;
}

function parseArtifactRow<TPayload>(row: Record<string, unknown>): ResearchArtifactRecord<TPayload> {
  const createdAtValue = row.created_at;
  return {
    artifactId: String(row.artifact_id),
    artifactKey: String(row.artifact_key),
    kind: String(row.artifact_kind) as ResearchArtifactKind,
    profileId: String(row.profile_id),
    symbol: String(row.symbol),
    csvPath: String(row.csv_path),
    executionModel: String(row.execution_model),
    priceBasis: String(row.price_basis),
    dataHash: String(row.data_hash),
    codeCommit: String(row.code_commit),
    createdAt: createdAtValue instanceof Date ? createdAtValue.toISOString() : String(createdAtValue),
    catalogId: row.catalog_id == null ? null : String(row.catalog_id),
    sweepId: row.sweep_id == null ? null : String(row.sweep_id),
    catalogHash: row.catalog_hash == null ? null : String(row.catalog_hash),
    sweepHash: row.sweep_hash == null ? null : String(row.sweep_hash),
    payloadHash: row.payload_hash == null ? null : String(row.payload_hash),
    payload: parseArtifactPayload(row.payload) as TPayload,
  };
}

function shouldPersistSqliteArtifact(artifact: ResearchArtifactRecord<unknown>): boolean {
  if (artifact.kind === "PARAMETER_SWEEP" || artifact.kind === "REGIME_WALK_FORWARD") {
    return true;
  }
  if (artifact.kind === "STRATEGY_RANKING") {
    return workspaceWarmupEnabled(artifact.profileId.split("_")[0] ?? "");
  }
  return false;
}

function maskDatabaseUrl(databaseUrl: string): string {
  return databaseUrl.replace(/:\/\/([^:/]+):([^@]+)@/, "://$1:***@");
}

function oversizeSqliteBackupPath(databasePath: string): string {
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  return `${databasePath}.oversize-${timestamp}`;
}

async function prepareSqliteSeedFile(databasePath: string): Promise<Uint8Array | undefined> {
  try {
    const fileStat = await stat(databasePath);
    if (fileStat.size > SQLITE_MAX_LOAD_BYTES) {
      const backupPath = oversizeSqliteBackupPath(databasePath);
      await rename(databasePath, backupPath);
      console.warn(`SQLite research store exceeded ${SQLITE_MAX_LOAD_BYTES} bytes and was rotated to ${backupPath}`);
      return undefined;
    }
    return new Uint8Array(await readFile(databasePath));
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
      throw error;
    }
    return undefined;
  }
}

export function describeResearchStoreTarget(): string {
  if (process.env.DATABASE_URL) {
    return `postgres (${maskDatabaseUrl(process.env.DATABASE_URL)})`;
  }
  if (process.env.SQLITE_PATH) {
    return `sqlite (${path.resolve(process.env.SQLITE_PATH)})`;
  }
  return "memory";
}

class MemoryResearchStore implements ResearchStore {
  private readonly artifactsById = new Map<string, ResearchArtifactRecord<AnyArtifactPayload>>();
  private readonly artifactIdByKey = new Map<string, string>();

  async findByKey<TPayload>(artifactKey: string): Promise<ResearchArtifactRecord<TPayload> | null> {
    const artifactId = this.artifactIdByKey.get(artifactKey);
    if (!artifactId) {
      return null;
    }
    return (this.artifactsById.get(artifactId) as ResearchArtifactRecord<TPayload> | undefined) ?? null;
  }

  async loadArtifact<TPayload>(artifactId: string): Promise<ResearchArtifactRecord<TPayload> | null> {
    return (this.artifactsById.get(artifactId) as ResearchArtifactRecord<TPayload> | undefined) ?? null;
  }

  async loadLatestSweep<TPayload>(filter: LatestSweepFilter): Promise<ResearchArtifactRecord<TPayload> | null> {
    const candidates = [...this.artifactsById.values()]
      .filter(
        (artifact) =>
          artifact.kind === "PARAMETER_SWEEP" &&
          artifact.sweepId === filter.sweepId &&
          artifact.csvPath === filter.csvPath &&
          artifact.executionModel === filter.executionModel &&
          artifact.priceBasis === filter.priceBasis &&
          artifact.dataHash === filter.dataHash,
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return (candidates[0] as ResearchArtifactRecord<TPayload> | undefined) ?? null;
  }

  async saveArtifact<TPayload>(
    artifact: ResearchArtifactRecord<TPayload>,
    _sweepRows: ParameterSweepRowPayload[] = [],
  ): Promise<ResearchArtifactRecord<TPayload>> {
    const existingId = this.artifactIdByKey.get(artifact.artifactKey);
    const artifactId = existingId ?? artifact.artifactId;
    const stored = { ...artifact, artifactId } as ResearchArtifactRecord<AnyArtifactPayload>;
    this.artifactIdByKey.set(artifact.artifactKey, artifactId);
    this.artifactsById.set(artifactId, stored);
    return stored as ResearchArtifactRecord<TPayload>;
  }
}

class PostgresResearchStore implements ResearchStore {
  private readonly pool: Pool;
  private readyPromise: Promise<void> | null = null;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  private async ensureReady(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = this.initialize();
    }
    return this.readyPromise;
  }

  private async initialize(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS backtest_research_artifacts (
        artifact_id UUID PRIMARY KEY,
        artifact_key VARCHAR NOT NULL UNIQUE,
        artifact_kind VARCHAR NOT NULL,
        profile_id VARCHAR NOT NULL,
        symbol VARCHAR NOT NULL,
        csv_path TEXT NOT NULL,
        execution_model VARCHAR NOT NULL,
        price_basis VARCHAR NOT NULL,
        data_hash CHAR(64) NOT NULL,
        code_commit VARCHAR NOT NULL,
        catalog_id VARCHAR,
        sweep_id VARCHAR,
        catalog_hash CHAR(64),
        sweep_hash CHAR(64),
        payload_hash CHAR(64),
        payload JSONB NOT NULL,
        created_at TIMESTAMP NOT NULL
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS backtest_research_sweep_rows (
        artifact_id UUID NOT NULL REFERENCES backtest_research_artifacts(artifact_id) ON DELETE CASCADE,
        row_index INT NOT NULL,
        combo_key VARCHAR NOT NULL,
        thread_count INT NOT NULL,
        stop_sessions INT NOT NULL,
        take_profit_pct NUMERIC NOT NULL,
        entry_drop_pct NUMERIC NOT NULL,
        stop_loss_pct NUMERIC NOT NULL,
        max_entries_per_session INT NOT NULL,
        config_hash CHAR(64) NOT NULL,
        total_return_pct NUMERIC NOT NULL,
        max_drawdown_pct NUMERIC NOT NULL,
        volatility_pct NUMERIC NOT NULL,
        trade_count INT NOT NULL,
        mean_segment_return_pct NUMERIC NOT NULL,
        segment_stddev_pct NUMERIC NOT NULL,
        worst_segment_return_pct NUMERIC NOT NULL,
        positive_segment_ratio_pct NUMERIC NOT NULL,
        recent_segment_return_pct NUMERIC NOT NULL,
        pareto_return_mdd BOOLEAN NOT NULL,
        pareto_return_stability BOOLEAN NOT NULL,
        payload JSONB NOT NULL,
        PRIMARY KEY (artifact_id, row_index)
      )
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS backtest_research_artifacts_kind_created_idx
      ON backtest_research_artifacts (artifact_kind, created_at DESC)
    `);
  }

  async findByKey<TPayload>(artifactKey: string): Promise<ResearchArtifactRecord<TPayload> | null> {
    await this.ensureReady();
    const result = await this.pool.query("SELECT * FROM backtest_research_artifacts WHERE artifact_key = $1", [artifactKey]);
    return result.rows[0] ? parseArtifactRow<TPayload>(result.rows[0] as Record<string, unknown>) : null;
  }

  async loadArtifact<TPayload>(artifactId: string): Promise<ResearchArtifactRecord<TPayload> | null> {
    await this.ensureReady();
    const result = await this.pool.query("SELECT * FROM backtest_research_artifacts WHERE artifact_id = $1", [artifactId]);
    return result.rows[0] ? parseArtifactRow<TPayload>(result.rows[0] as Record<string, unknown>) : null;
  }

  async loadLatestSweep<TPayload>(filter: LatestSweepFilter): Promise<ResearchArtifactRecord<TPayload> | null> {
    await this.ensureReady();
    const result = await this.pool.query(
      `
        SELECT *
        FROM backtest_research_artifacts
        WHERE artifact_kind = 'PARAMETER_SWEEP'
          AND sweep_id = $1
          AND csv_path = $2
          AND execution_model = $3
          AND price_basis = $4
          AND data_hash = $5
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [filter.sweepId, filter.csvPath, filter.executionModel, filter.priceBasis, filter.dataHash],
    );
    return result.rows[0] ? parseArtifactRow<TPayload>(result.rows[0] as Record<string, unknown>) : null;
  }

  async saveArtifact<TPayload>(
    artifact: ResearchArtifactRecord<TPayload>,
    sweepRows: ParameterSweepRowPayload[] = [],
  ): Promise<ResearchArtifactRecord<TPayload>> {
    await this.ensureReady();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const artifactResult = await client.query(
        `
          INSERT INTO backtest_research_artifacts (
            artifact_id,
            artifact_key,
            artifact_kind,
            profile_id,
            symbol,
            csv_path,
            execution_model,
            price_basis,
            data_hash,
            code_commit,
            catalog_id,
            sweep_id,
            catalog_hash,
            sweep_hash,
            payload_hash,
            payload,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17)
          ON CONFLICT (artifact_key) DO UPDATE SET
            artifact_kind = EXCLUDED.artifact_kind,
            profile_id = EXCLUDED.profile_id,
            symbol = EXCLUDED.symbol,
            csv_path = EXCLUDED.csv_path,
            execution_model = EXCLUDED.execution_model,
            price_basis = EXCLUDED.price_basis,
            data_hash = EXCLUDED.data_hash,
            code_commit = EXCLUDED.code_commit,
            catalog_id = EXCLUDED.catalog_id,
            sweep_id = EXCLUDED.sweep_id,
            catalog_hash = EXCLUDED.catalog_hash,
            sweep_hash = EXCLUDED.sweep_hash,
            payload_hash = EXCLUDED.payload_hash,
            payload = EXCLUDED.payload,
            created_at = EXCLUDED.created_at
          RETURNING *
        `,
        [
          artifact.artifactId,
          artifact.artifactKey,
          artifact.kind,
          artifact.profileId,
          artifact.symbol,
          artifact.csvPath,
          artifact.executionModel,
          artifact.priceBasis,
          artifact.dataHash,
          artifact.codeCommit,
          artifact.catalogId ?? null,
          artifact.sweepId ?? null,
          artifact.catalogHash ?? null,
          artifact.sweepHash ?? null,
          artifact.payloadHash ?? null,
          JSON.stringify(artifact.payload),
          artifact.createdAt,
        ],
      );
      const stored = parseArtifactRow<TPayload>(artifactResult.rows[0] as Record<string, unknown>);
      await client.query("DELETE FROM backtest_research_sweep_rows WHERE artifact_id = $1", [stored.artifactId]);
      if (artifact.kind === "PARAMETER_SWEEP" && sweepRows.length > 0) {
        for (const [index, row] of sweepRows.entries()) {
          await client.query(
            `
              INSERT INTO backtest_research_sweep_rows (
                artifact_id,
                row_index,
                combo_key,
                thread_count,
                stop_sessions,
                take_profit_pct,
                entry_drop_pct,
                stop_loss_pct,
                max_entries_per_session,
                config_hash,
                total_return_pct,
                max_drawdown_pct,
                volatility_pct,
                trade_count,
                mean_segment_return_pct,
                segment_stddev_pct,
                worst_segment_return_pct,
                positive_segment_ratio_pct,
                recent_segment_return_pct,
                pareto_return_mdd,
                pareto_return_stability,
                payload
              )
              VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22::jsonb
              )
            `,
            [
              stored.artifactId,
              index,
              row.combo_key,
              row.params.thread_count,
              row.params.stop_sessions,
              row.params.sell_pct,
              row.params.buy_pct,
              0,
              1,
              row.config_hash,
              row.metrics.full_return_pct,
              row.metrics.max_drawdown_pct,
              row.metrics.volatility_pct,
              row.metrics.trade_count,
              row.metrics.mean_segment_return_pct,
              row.metrics.segment_stddev_pct,
              row.metrics.worst_segment_return_pct,
              row.metrics.positive_segment_ratio_pct,
              row.metrics.recent_segment_return_pct,
              row.flags.pareto_return_mdd,
              row.flags.pareto_return_stability,
              JSON.stringify(row),
            ],
          );
        }
      }
      await client.query("COMMIT");
      return stored;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

class SqliteResearchStore implements ResearchStore {
  private readonly readyPromise: Promise<void>;
  private writeQueue: Promise<void> = Promise.resolve();
  private persistPending: Promise<void> | null = null;
  private persistDirty = false;

  private constructor(
    private readonly databasePath: string,
    private readonly database: import("sql.js").Database,
  ) {
    this.readyPromise = this.initialize();
  }

  static async create(databasePath: string): Promise<SqliteResearchStore> {
    const sqlitePath = path.resolve(databasePath);
    await mkdir(path.dirname(sqlitePath), { recursive: true });
    const SQL = await initSqlJs({
      locateFile: () => SQLITE_WASM_PATH,
    });
    const bytes = await prepareSqliteSeedFile(sqlitePath);
    const database = bytes ? new SQL.Database(bytes) : new SQL.Database();
    return new SqliteResearchStore(sqlitePath, database);
  }

  private async ensureReady(): Promise<void> {
    await this.readyPromise;
  }

  private async initialize(): Promise<void> {
    this.database.run(`
      CREATE TABLE IF NOT EXISTS backtest_research_artifacts (
        artifact_id TEXT PRIMARY KEY,
        artifact_key TEXT NOT NULL UNIQUE,
        artifact_kind TEXT NOT NULL,
        profile_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        csv_path TEXT NOT NULL,
        execution_model TEXT NOT NULL,
        price_basis TEXT NOT NULL,
        data_hash TEXT NOT NULL,
        code_commit TEXT NOT NULL,
        catalog_id TEXT,
        sweep_id TEXT,
        catalog_hash TEXT,
        sweep_hash TEXT,
        payload_hash TEXT,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
    this.database.run(`
      CREATE TABLE IF NOT EXISTS backtest_research_sweep_rows (
        artifact_id TEXT NOT NULL,
        row_index INTEGER NOT NULL,
        combo_key TEXT NOT NULL,
        thread_count INTEGER NOT NULL,
        stop_sessions INTEGER NOT NULL,
        take_profit_pct REAL NOT NULL,
        entry_drop_pct REAL NOT NULL,
        stop_loss_pct REAL NOT NULL,
        max_entries_per_session INTEGER NOT NULL,
        config_hash TEXT NOT NULL,
        total_return_pct REAL NOT NULL,
        max_drawdown_pct REAL NOT NULL,
        volatility_pct REAL NOT NULL,
        trade_count INTEGER NOT NULL,
        mean_segment_return_pct REAL NOT NULL,
        segment_stddev_pct REAL NOT NULL,
        worst_segment_return_pct REAL NOT NULL,
        positive_segment_ratio_pct REAL NOT NULL,
        recent_segment_return_pct REAL NOT NULL,
        pareto_return_mdd INTEGER NOT NULL,
        pareto_return_stability INTEGER NOT NULL,
        payload TEXT NOT NULL,
        PRIMARY KEY (artifact_id, row_index)
      )
    `);
    this.database.run(`
      CREATE INDEX IF NOT EXISTS backtest_research_artifacts_kind_created_idx
      ON backtest_research_artifacts (artifact_kind, created_at DESC)
    `);
  }

  private selectOne(sql: string, params: SqliteBindValue[] = []): Record<string, unknown> | null {
    const statement = this.database.prepare(sql);
    try {
      statement.bind(params);
      if (!statement.step()) {
        return null;
      }
      return statement.getAsObject() as Record<string, unknown>;
    } finally {
      statement.free();
    }
  }

  private async persist(): Promise<void> {
    const bytes = Buffer.from(this.database.export());
    const tempPath = `${this.databasePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(tempPath, bytes);
    await rename(tempPath, this.databasePath);
  }

  private schedulePersist(): void {
    this.persistDirty = true;
    if (this.persistPending) {
      return;
    }
    this.persistPending = new Promise<void>((resolve) => {
      setTimeout(resolve, 250);
    }).then(() =>
      this.enqueueWrite(async () => {
        if (!this.persistDirty) {
          return;
        }
        this.persistDirty = false;
        await this.persist();
      }))
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`SQLite artifact persist failed: ${message}`);
      })
      .finally(() => {
        this.persistPending = null;
        if (this.persistDirty) {
          this.schedulePersist();
        }
      });
  }

  private enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
    const runner = this.writeQueue.then(operation, operation);
    this.writeQueue = runner.then(() => undefined, () => undefined);
    return runner;
  }

  async findByKey<TPayload>(artifactKey: string): Promise<ResearchArtifactRecord<TPayload> | null> {
    await this.ensureReady();
    const row = this.selectOne("SELECT * FROM backtest_research_artifacts WHERE artifact_key = ?", [artifactKey]);
    return row ? parseArtifactRow<TPayload>(row) : null;
  }

  async loadArtifact<TPayload>(artifactId: string): Promise<ResearchArtifactRecord<TPayload> | null> {
    await this.ensureReady();
    const row = this.selectOne("SELECT * FROM backtest_research_artifacts WHERE artifact_id = ?", [artifactId]);
    return row ? parseArtifactRow<TPayload>(row) : null;
  }

  async loadLatestSweep<TPayload>(filter: LatestSweepFilter): Promise<ResearchArtifactRecord<TPayload> | null> {
    await this.ensureReady();
    const row = this.selectOne(
      `
        SELECT *
        FROM backtest_research_artifacts
        WHERE artifact_kind = 'PARAMETER_SWEEP'
          AND sweep_id = ?
          AND csv_path = ?
          AND execution_model = ?
          AND price_basis = ?
          AND data_hash = ?
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [filter.sweepId, filter.csvPath, filter.executionModel, filter.priceBasis, filter.dataHash],
    );
    return row ? parseArtifactRow<TPayload>(row) : null;
  }

  async saveArtifact<TPayload>(
    artifact: ResearchArtifactRecord<TPayload>,
    sweepRows: ParameterSweepRowPayload[] = [],
  ): Promise<ResearchArtifactRecord<TPayload>> {
    await this.ensureReady();
    return this.enqueueWrite(async () => {
      this.database.run("BEGIN");
      try {
        this.database.run(
          `
            INSERT INTO backtest_research_artifacts (
              artifact_id,
              artifact_key,
              artifact_kind,
              profile_id,
              symbol,
              csv_path,
              execution_model,
              price_basis,
              data_hash,
              code_commit,
              catalog_id,
              sweep_id,
              catalog_hash,
              sweep_hash,
              payload_hash,
              payload,
              created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(artifact_key) DO UPDATE SET
              artifact_kind = excluded.artifact_kind,
              profile_id = excluded.profile_id,
              symbol = excluded.symbol,
              csv_path = excluded.csv_path,
              execution_model = excluded.execution_model,
              price_basis = excluded.price_basis,
              data_hash = excluded.data_hash,
              code_commit = excluded.code_commit,
              catalog_id = excluded.catalog_id,
              sweep_id = excluded.sweep_id,
              catalog_hash = excluded.catalog_hash,
              sweep_hash = excluded.sweep_hash,
              payload_hash = excluded.payload_hash,
              payload = excluded.payload,
              created_at = excluded.created_at
          `,
          [
            artifact.artifactId,
            artifact.artifactKey,
            artifact.kind,
            artifact.profileId,
            artifact.symbol,
            artifact.csvPath,
            artifact.executionModel,
            artifact.priceBasis,
            artifact.dataHash,
            artifact.codeCommit,
            artifact.catalogId ?? null,
            artifact.sweepId ?? null,
            artifact.catalogHash ?? null,
            artifact.sweepHash ?? null,
            artifact.payloadHash ?? null,
            JSON.stringify(artifact.payload),
            artifact.createdAt,
          ],
        );
        const storedRow = this.selectOne("SELECT * FROM backtest_research_artifacts WHERE artifact_key = ?", [artifact.artifactKey]);
        if (!storedRow) {
          throw new Error(`Failed to reload persisted artifact ${artifact.artifactKey}`);
        }
        const stored = parseArtifactRow<TPayload>(storedRow);
        this.database.run("DELETE FROM backtest_research_sweep_rows WHERE artifact_id = ?", [stored.artifactId]);
        if (artifact.kind === "PARAMETER_SWEEP" && sweepRows.length > 0) {
          for (const [index, row] of sweepRows.entries()) {
            this.database.run(
              `
                INSERT INTO backtest_research_sweep_rows (
                  artifact_id,
                  row_index,
                  combo_key,
                  thread_count,
                  stop_sessions,
                  take_profit_pct,
                  entry_drop_pct,
                  stop_loss_pct,
                  max_entries_per_session,
                  config_hash,
                  total_return_pct,
                  max_drawdown_pct,
                  volatility_pct,
                  trade_count,
                  mean_segment_return_pct,
                  segment_stddev_pct,
                  worst_segment_return_pct,
                  positive_segment_ratio_pct,
                  recent_segment_return_pct,
                  pareto_return_mdd,
                  pareto_return_stability,
                  payload
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `,
              [
                stored.artifactId,
                index,
                row.combo_key,
                row.params.thread_count,
                row.params.stop_sessions,
                row.params.sell_pct,
                row.params.buy_pct,
                0,
                1,
                row.config_hash,
                row.metrics.full_return_pct,
                row.metrics.max_drawdown_pct,
                row.metrics.volatility_pct,
                row.metrics.trade_count,
                row.metrics.mean_segment_return_pct,
                row.metrics.segment_stddev_pct,
                row.metrics.worst_segment_return_pct,
                row.metrics.positive_segment_ratio_pct,
                row.metrics.recent_segment_return_pct,
                row.flags.pareto_return_mdd ? 1 : 0,
                row.flags.pareto_return_stability ? 1 : 0,
                JSON.stringify(row),
              ],
            );
          }
        }
        this.database.run("COMMIT");
        if (shouldPersistSqliteArtifact(stored)) {
          this.schedulePersist();
        }
        return stored;
      } catch (error) {
        this.database.run("ROLLBACK");
        throw error;
      }
    });
  }
}

let singletonPromise: Promise<ResearchStore> | null = null;

export function newResearchArtifactId(): string {
  return randomUUID();
}

export async function getResearchStore(): Promise<ResearchStore> {
  if (!singletonPromise) {
    if (process.env.DATABASE_URL) {
      singletonPromise = Promise.resolve(new PostgresResearchStore(process.env.DATABASE_URL));
    } else if (process.env.SQLITE_PATH) {
      singletonPromise = SqliteResearchStore.create(process.env.SQLITE_PATH);
    } else {
      singletonPromise = Promise.resolve(new MemoryResearchStore());
    }
  }
  return singletonPromise;
}

export const __testing = {
  prepareSqliteSeedFile,
  oversizeSqliteBackupPath,
  get SQLITE_MAX_LOAD_BYTES() {
    return SQLITE_MAX_LOAD_BYTES;
  },
  set SQLITE_MAX_LOAD_BYTES(value: number) {
    SQLITE_MAX_LOAD_BYTES = value;
  },
};
