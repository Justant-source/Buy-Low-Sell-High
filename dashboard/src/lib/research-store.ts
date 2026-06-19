import { randomUUID } from "node:crypto";

import { Pool } from "pg";

import type {
  ParameterSweepPayload,
  ParameterSweepRowPayload,
  ResearchArtifactKind,
  ResearchArtifactRecord,
} from "./types.js";

type AnyArtifactPayload = ParameterSweepPayload | Record<string, unknown>;

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
    payload: row.payload as TPayload,
  };
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
              row.params.take_profit_pct,
              row.params.entry_drop_pct,
              row.params.stop_loss_pct,
              row.params.max_entries_per_session,
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

let singletonPromise: Promise<ResearchStore> | null = null;

export function newResearchArtifactId(): string {
  return randomUUID();
}

export async function getResearchStore(): Promise<ResearchStore> {
  if (!singletonPromise) {
    singletonPromise = Promise.resolve(
      process.env.DATABASE_URL ? new PostgresResearchStore(process.env.DATABASE_URL) : new MemoryResearchStore(),
    );
  }
  return singletonPromise;
}
