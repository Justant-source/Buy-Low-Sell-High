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

export interface BacktestOverrides {
  threadCount?: number;
  stopSessions?: number;
  takeProfitPct?: number;
  takeProfitOperator?: "gt" | "gte";
  entryDropPct?: number;
  stopLossPct?: number;
  maxEntriesPerSession?: number;
  sizingMode?: string;
  priceBasis?: string;
}

export interface ProfileShowPayload {
  profile_id: string;
  symbol: string;
  thread_count: number;
  stop_sessions: number;
  max_entries_per_session: number;
  take_profit_pct: string;
  take_profit_operator: string;
  entry_drop_pct: string;
  stop_loss_pct: string;
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

export interface MentorMatrixCountPayload {
  take_profit: number;
  time_stop: number;
}

export interface MentorMatrixActualComboPayload {
  thread_count: number;
  stop_sessions: number;
  yearly_returns_pct: Record<string, number>;
  yearly_counts: Record<string, MentorMatrixCountPayload>;
  stats_pct: Record<string, number>;
  simple_returns_pct: Record<string, number>;
  compound_returns_pct: Record<string, number>;
  aggregate_count_rows: Record<string, MentorMatrixCountPayload>;
}

export interface MentorMatrixReferenceComboPayload {
  yearly_returns_pct: Record<string, number>;
  stats_pct: Record<string, number>;
  simple_returns_pct: Record<string, number>;
  compound_returns_pct: Record<string, number>;
}

export interface MentorMatrixReferenceCountComboPayload {
  yearly_counts: Record<string, MentorMatrixCountPayload>;
  aggregate_rows: Record<string, MentorMatrixCountPayload>;
}

export interface MentorMatrixReferencePayload {
  meta: {
    source_image_sha256: string;
    base_capital_usd?: string;
    period_start?: string;
    period_end?: string;
    assumed_price_basis?: string;
    assumed_execution_model?: string;
    authoritative?: boolean;
    notes?: string[];
  };
  benchmark: {
    yearly: Array<{ year: number; price_change: string; return_pct: number }>;
    aggregate_rows: Record<string, number>;
    aggregate_notes?: string[];
  };
  combos: Record<string, MentorMatrixReferenceComboPayload>;
  selected_count_combos: Record<string, MentorMatrixReferenceCountComboPayload>;
}

export interface MentorMatrixPayload {
  meta: {
    symbol: string;
    period_start: string;
    period_end: string;
    initial_capital: string;
    price_basis: string;
    execution_model: string;
    config_hash: string;
    data_hash: string;
    code_commit: string;
    windows: Record<string, { start_year: number; end_year: number }>;
    reference_fixture_path: string;
    reference_image_sha256: string;
  };
  reference: MentorMatrixReferencePayload;
  actual: {
    benchmark: {
      yearly: Array<{ year: number; price_change: string; return_pct: number }>;
      aggregate_rows: Record<string, number>;
    };
    combos: Record<string, MentorMatrixActualComboPayload>;
    selected_count_combos: Record<string, MentorMatrixReferenceCountComboPayload>;
  };
  parity: {
    status: string;
    data_status: string;
    value_status: string;
    first_mismatch: Record<string, string> | null;
    mismatches: Array<Record<string, string>>;
  };
}

export interface RiskScenarioRowPayload {
  label: string;
  execution_model: string;
  commission_bps: string;
  slippage_bps: string;
  total_return_pct: string;
  max_drawdown_pct: string;
  volatility_pct: string;
  trade_count: number;
  peak_to_trough_sessions: number | null;
  trough_to_recovery_sessions: number | null;
  peak_to_recovery_sessions: number | null;
  recovered: boolean;
}

export interface BacktestRiskPayload {
  profile_id: string;
  symbol: string;
  data_hash: string;
  config_hash: string;
  model_comparison: RiskScenarioRowPayload[];
  cost_sensitivity: RiskScenarioRowPayload[];
  sensitivity_summary: {
    best_next_open_return_cell: {
      thread_count: number;
      stop_sessions: number;
      total_return_pct: string;
    };
    lowest_next_open_mdd_cell: {
      thread_count: number;
      stop_sessions: number;
      max_drawdown_pct: string;
    };
  };
  summary: {
    ideal_to_next_open_return_drag_pct: string;
    next_open_to_next_close_return_drag_pct: string;
    stress_cost_drag_pct: string;
    worst_recovery_sessions: number | null;
  };
  warnings: string[];
}

export interface StrategySlicePresetPayload {
  preset_id: string;
  label: string;
  start: string;
  end: string;
}

export interface StrategyMonthlyRowPayload {
  month: string;
  start: string;
  end: string;
  start_equity: string;
  end_equity: string;
  pnl: string;
  return_pct: string;
  max_drawdown_pct: string;
  session_count: number;
}

export interface StrategySegmentRowPayload {
  segment_id: string;
  label: string;
  start: string;
  end: string;
  start_equity: string;
  end_equity: string;
  pnl: string;
  return_pct: string;
  max_drawdown_pct: string;
  session_count: number;
}

export interface StrategyExplorerStrategyPayload {
  strategy_id: string;
  label: string;
  thread_count: number;
  stop_sessions: number;
  mentor_profiles: string[];
  config_hash: string;
  metrics: Record<string, string | number>;
  yearly: Record<string, Record<string, string | number>>;
  monthly: StrategyMonthlyRowPayload[];
  segments: StrategySegmentRowPayload[];
  daily: DailyPointPayload[];
}

export interface StrategyExplorerPayload {
  meta: {
    catalog_id: string;
    catalog_hash: string;
    symbol: string;
    initial_capital: string;
    price_basis: string;
    execution_model: string;
    period_start: string;
    period_end: string;
    data_hash: string;
    code_commit: string;
    slice_presets: StrategySlicePresetPayload[];
    segment_presets: StrategySlicePresetPayload[];
  };
  strategies: StrategyExplorerStrategyPayload[];
}

export interface ParameterSweepRowPayload {
  combo_key: string;
  config_hash: string;
  params: {
    thread_count: number;
    stop_sessions: number;
    take_profit_pct: number;
    entry_drop_pct: number;
    stop_loss_pct: number;
    max_entries_per_session: number;
  };
  metrics: {
    full_return_pct: number;
    max_drawdown_pct: number;
    volatility_pct: number;
    trade_count: number;
    mean_segment_return_pct: number;
    segment_stddev_pct: number;
    worst_segment_return_pct: number;
    positive_segment_ratio_pct: number;
    recent_segment_return_pct: number;
  };
  yearly_returns_pct: Record<string, number>;
  segment_returns_pct: Record<string, number>;
  flags: {
    pareto_return_mdd: boolean;
    pareto_return_stability: boolean;
  };
}

export interface ParameterSweepPayload {
  meta: {
    sweep_id: string;
    sweep_hash: string;
    symbol: string;
    initial_capital: string;
    execution_model: string;
    price_basis: string;
    period_start: string;
    period_end: string;
    data_hash: string;
    code_commit: string;
    combo_count: number;
    segment_presets: StrategySlicePresetPayload[];
    parameter_values: Record<string, number[]>;
  };
  summary: {
    best_full_return_combo: string;
    best_robust_combo: string;
    pareto_return_mdd_count: number;
    pareto_return_stability_count: number;
    ranking_basis: string;
  };
  warnings: string[];
  rows: ParameterSweepRowPayload[];
  payload_hash: string;
}

export interface ManualRecommendationPayload {
  thread_id: number;
  action: string;
  reason: string;
  basis_price: string;
  session_date: string;
}

export interface ManualComparisonRowPayload {
  thread_id: number;
  action: string;
  expected_side: string | null;
  reason: string;
  basis_price: string;
  session_date: string;
  status: string;
  execution_quality: string;
  fill_id: string | null;
  actual_price: string | null;
  actual_quantity: string | null;
  actual_filled_at: string | null;
  price_gap: string | null;
  price_gap_pct: string | null;
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
export type DashboardJobKind = "BACKTEST" | "BACKTEST_SWEEP";

export interface DashboardJobRecord {
  jobId: string;
  kind: DashboardJobKind;
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
  artifactId?: string | null;
  error: string | null;
  sweepId?: string;
  catalogId?: string;
  executionModel?: string;
  priceBasis?: string;
  overrides?: BacktestOverrides;
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

export type ResearchArtifactKind = "STRATEGY_EXPLORER" | "PARAMETER_SWEEP";

export interface ResearchArtifactRecord<TPayload> {
  artifactId: string;
  artifactKey: string;
  kind: ResearchArtifactKind;
  profileId: string;
  symbol: string;
  csvPath: string;
  executionModel: string;
  priceBasis: string;
  dataHash: string;
  codeCommit: string;
  createdAt: string;
  catalogId?: string | null;
  sweepId?: string | null;
  catalogHash?: string | null;
  sweepHash?: string | null;
  payloadHash?: string | null;
  payload: TPayload;
}
