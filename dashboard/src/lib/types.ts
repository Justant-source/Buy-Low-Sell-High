export interface DataStatusPayload {
  symbol: string;
  rows: number;
  start: string;
  end: string;
  data_hash: string;
  source: string;
  warnings: string[];
  snapshot_path: string;
}

export interface ProfileDefinition {
  profileId: string;
  name: string;
  description: string;
  profilePath: string;
  symbol: string;
  threadCount: number;
  stopSessions: number;
  priceBasis: string;
  executionModel: string;
}

export interface ProfilePayload extends ProfileDefinition {
  configHash: string;
  initialCapital: string;
}

export interface ProfileShowPayload {
  profile_id: string;
  symbol: string;
  thread_count: number;
  stop_sessions: number;
  price_basis: string;
  execution_model: string;
  sizing_mode: string;
  year_boundary: string;
  end_of_test: string;
  config_hash: string;
  initial_capital: string;
}

export interface DailyPointPayload {
  session_date: string;
  session_index: number;
  total_equity: string;
  realized_pnl: string;
  drawdown: string;
  open_threads: number;
  entries: number;
  take_profits: number;
  time_stops: number;
  skipped_entries: number;
}

export interface TradePayload {
  thread_id: number;
  signal_date: string;
  fill_entry_date: string;
  entry_price: string;
  shares: string;
  invested_amount: string;
  exit_signal_date: string | null;
  fill_exit_date: string | null;
  exit_price: string | null;
  holding_sessions: number | null;
  pnl: string;
  return_pct: string;
  close_reason: string | null;
}

export interface BacktestDetailPayload {
  run_id: string;
  profile_id: string;
  code_commit: string;
  data_hash: string;
  config_hash: string;
  config: Record<string, unknown>;
  metrics: Record<string, string | number>;
  yearly: Record<string, Record<string, string | number>>;
  daily: DailyPointPayload[];
  trades: TradePayload[];
}

export interface GridCellPayload {
  profile_id: string;
  thread_count: number;
  stop_sessions: number;
  config_hash: string;
  data_hash: string;
  total_return_pct: string;
  max_drawdown_pct: string;
  volatility_pct: string;
  trade_count: number;
}

export interface ManualRecommendationPayload {
  thread_id: number;
  action: string;
  reason: string;
  basis_price: string;
  session_date: string;
}

export interface ManualLedgerPayload {
  summary: {
    account_id: string;
    thread_count: number;
    fill_count: number;
    open_threads: number;
    total_cash: string;
    total_quantity: string;
  };
  issues: string[];
  threads: Array<{
    thread_id: number;
    cash: string;
    quantity: string;
    entry_price: string;
    entry_date: string | null;
  }>;
  fills: Array<{
    fill_id: string;
    thread_id: number;
    side: string;
    quantity: string;
    price: string;
    fee: string;
    filled_at: string;
    reversed_by_fill_id: string | null;
  }>;
}

export type DashboardJobStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";

export interface DashboardJobRecord {
  jobId: string;
  kind: "BACKTEST";
  status: DashboardJobStatus;
  profileId: string;
  symbol: string;
  csvPath: string;
  initialCapital: number;
  configHash: string;
  dataHash: string;
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  progress: number;
  runId: string | null;
  error: string | null;
}

export interface PersistedRunArtifact {
  runId: string;
  profileId: string;
  symbol: string;
  csvPath: string;
  createdAt: string;
  dataHash: string;
  configHash: string;
  payload: BacktestDetailPayload;
}
