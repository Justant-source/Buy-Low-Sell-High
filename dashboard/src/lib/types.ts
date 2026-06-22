export interface DataStatusPayload {
  symbol: string;
  rows: number;
  start: string;
  end: string;
  data_hash: string;
  source: string;
  warnings: string[];
  snapshot_path: string;
  manifest_path: string | null;
}

export interface ProfileDefinition {
  workspaceId: string;
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

export interface WorkspaceDefinition {
  workspaceId: string;
  symbol: string;
  displayName: string;
  routeSlug: string;
  navLabel: string;
  description: string;
  summary: string;
  defaultProfileId: string;
  csvPath: string;
  referenceMode: "mentor_reference" | "official_reference" | "backtest_only";
  warningTags: string[];
  defaultStrategyExecutionModel: string;
  defaultStrategyPriceBasis: string;
  defaultSweepExecutionModel: string;
  defaultSweepPriceBasis: string;
  guideTitle: string;
  guideLead: string;
  guideWhyTitle: string;
  guideWhyCopy: string;
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
  regimeEnabled?: boolean;
  regimeSymbol?: string;
  regimeRsiPeriodWeeks?: number;
  regimeBearHighThreshold?: number;
  regimeBearMidLowThreshold?: number;
  regimeBearMidHighThreshold?: number;
  regimeBullLowThreshold?: number;
  regimeBullMidLowThreshold?: number;
  regimeBullMidHighThreshold?: number;
  regimeBaseStopSessions?: number;
  regimeBaseBuyPct?: number;
  regimeBaseSellPct?: number;
  regimeBullStopSessions?: number;
  regimeBullBuyPct?: number;
  regimeBullSellPct?: number;
  regimeBearStopSessions?: number;
  regimeBearBuyPct?: number;
  regimeBearSellPct?: number;
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
  regime_enabled?: boolean;
  regime_symbol?: string;
  regime_rsi_period_weeks?: number;
  regime_bear_high_threshold?: string;
  regime_bear_mid_low_threshold?: string;
  regime_bear_mid_high_threshold?: string;
  regime_bull_low_threshold?: string;
  regime_bull_mid_low_threshold?: string;
  regime_bull_mid_high_threshold?: string;
  regime_base_stop_sessions?: number;
  regime_base_buy_pct?: string;
  regime_base_sell_pct?: string;
  regime_bull_stop_sessions?: number;
  regime_bull_buy_pct?: string;
  regime_bull_sell_pct?: string;
  regime_bear_stop_sessions?: number;
  regime_bear_buy_pct?: string;
  regime_bear_sell_pct?: string;
  regime_config_hash?: string;
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
  applied_regime?: string;
}

export interface TradePayload {
  thread_id: number;
  signal_date: string;
  fill_entry_date: string;
  entry_price: string;
  shares: string;
  invested_amount: string;
  entry_fee: string;
  exit_signal_date: string | null;
  fill_exit_date: string | null;
  exit_price: string | null;
  exit_fee: string;
  total_fees: string;
  holding_sessions: number | null;
  pnl: string;
  return_pct: string;
  close_reason: string | null;
  entry_regime?: string;
  entry_stop_sessions?: number;
  entry_buy_pct?: string;
  entry_sell_pct?: string;
}

export interface BacktestDetailPayload {
  run_id: string;
  profile_id: string;
  code_commit: string;
  data_hash: string;
  regime_data_hash?: string | null;
  regime_config_hash?: string | null;
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

export interface OfficialExplorerRankingPayload {
  rank: number;
  combo_key: string;
  strategy_id: string;
  label: string;
  thread_count: number;
  stop_sessions: number;
  full_return_pct: number;
  mean_segment_return_pct: number;
  segment_stddev_pct: number;
  worst_segment_return_pct: number;
  positive_segment_ratio_pct: number;
  recent_segment_return_pct: number;
}

export interface OfficialExplorerPayload {
  meta: {
    catalog_id: string;
    symbol: string;
    initial_capital: string;
    price_basis: string;
    execution_model: string;
    period_start: string;
    period_end: string;
    data_hash: string;
    code_commit: string;
    selection_basis: string;
    official_profile_id: string;
    official_combo_key: string;
  };
  official_profile: {
    profile_id: string;
    combo_key: string;
    thread_count: number;
    stop_sessions: number;
    config_hash: string;
  };
  current_catalog_top: OfficialExplorerRankingPayload | null;
  matches_current_catalog_top: boolean;
  rankings: OfficialExplorerRankingPayload[];
}

export interface OfficialMatrixPayload {
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
    official_profile_id: string;
    official_combo_key: string;
  };
  benchmark: {
    yearly: Array<{ year: number; price_change: string; return_pct: number }>;
    aggregate_rows: Record<string, number>;
  };
  combos: Record<string, MentorMatrixActualComboPayload>;
  selected_count_combos: Record<string, MentorMatrixReferenceCountComboPayload>;
  selection: OfficialExplorerPayload;
}

export interface RiskScenarioRowPayload {
  label: string;
  execution_model: string;
  commission_bps: string;
  transaction_tax_bps: string;
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
  buy_pct?: number;
  sell_pct?: number;
  display_params?: string;
  regime_enabled?: boolean;
  bull_stop_sessions?: number;
  bull_buy_pct?: number;
  bull_sell_pct?: number;
  bear_stop_sessions?: number;
  bear_buy_pct?: number;
  bear_sell_pct?: number;
  mentor_profiles: string[];
  config_hash: string;
  meta: {
    strategy_id: string;
    symbol: string;
    initial_capital: string;
    price_basis: string;
    execution_model: string;
    period_start: string;
    period_end: string;
    data_hash: string;
    config_hash: string;
    code_commit: string;
    regime_enabled?: boolean;
    regime_symbol?: string;
    regime_data_hash?: string | null;
    regime_config_hash?: string | null;
  };
  metrics: Record<string, string | number>;
  yearly: Record<string, Record<string, string | number>>;
  monthly: StrategyMonthlyRowPayload[];
  segments: StrategySegmentRowPayload[];
  daily: DailyPointPayload[];
}

export interface StrategyExplorerBenchmarkPayload {
  strategy_id: string;
  label: string;
  combo_key: string;
  metrics: Record<string, string | number>;
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
    ranking_basis: string;
    slice_presets: StrategySlicePresetPayload[];
    segment_presets: StrategySlicePresetPayload[];
    regime_enabled?: boolean;
    regime_symbol?: string | null;
    regime_data_hash?: string | null;
    regime_config_hash?: string | null;
  };
  benchmark: StrategyExplorerBenchmarkPayload | null;
  strategies: StrategyExplorerStrategyPayload[];
  rankings: OfficialExplorerRankingPayload[];
}

export interface StrategyRankingRowPayload {
  combo_key: string;
  strategy_id: string;
  label: string;
  display_params: string;
  thread_count: number;
  stop_sessions: number;
  buy_pct: number;
  sell_pct: number;
  regime_enabled?: boolean;
  bull_stop_sessions?: number;
  bull_buy_pct?: number;
  bull_sell_pct?: number;
  bear_stop_sessions?: number;
  bear_buy_pct?: number;
  bear_sell_pct?: number;
  full_return_pct: number;
  cagr_pct: number;
  max_drawdown_pct: number;
  trade_count: number;
  rank: number;
}

export interface StrategyRankingPayload {
  meta: {
    symbol: string;
    initial_capital: string;
    price_basis: string;
    execution_model: string;
    period_start: string;
    period_end: string;
    data_hash: string;
    code_commit: string;
    ranking_basis: string;
    segment_presets: StrategySlicePresetPayload[];
    combo_count: number;
    regime_enabled?: boolean;
    regime_symbol?: string | null;
    regime_data_hash?: string | null;
    regime_config_hash?: string | null;
  };
  rows: StrategyRankingRowPayload[];
}

export interface ThreadTimelineLaneIntervalPayload {
  trade_id: string;
  thread_id: number;
  start_date: string;
  end_date: string | null;
  visible_end_date: string;
  entry_price: string;
  exit_price: string | null;
  shares: string;
  invested_amount: string;
  entry_fee: string;
  exit_fee: string;
  total_fees: string;
  close_reason: string | null;
  pnl: string | null;
  return_pct: string | null;
  holding_sessions: number | null;
  status: "OPEN" | "CLOSED";
}

export interface ThreadTimelineLanePayload {
  thread_id: number;
  label: string;
  intervals: ThreadTimelineLaneIntervalPayload[];
}

export interface ThreadTimelineEntryPayload {
  trade_id: string;
  thread_id: number;
  entry_price: string;
  shares: string;
  invested_amount: string;
  entry_fee: string;
  entry_regime?: string;
}

export interface ThreadTimelineExitPayload {
  trade_id: string;
  thread_id: number;
  entry_regime?: string;
  close_reason: string;
  entry_price: string;
  exit_price: string;
  entry_fee: string;
  exit_fee: string;
  total_fees: string;
  pnl: string;
  return_pct: string;
  holding_sessions: number | null;
}

export interface ThreadTimelineOpenPositionPayload {
  trade_id: string;
  thread_id: number;
  entry_price: string;
  shares: string;
  invested_amount: string;
  entry_fee: string;
  mark_price: string;
  marked_value: string;
  unrealized_pnl: string;
  age_sessions: number;
}

export interface ThreadTimelineSessionPayload {
  session_date: string;
  session_index: number;
  close_price: string;
  open_threads: number;
  entries: number;
  exit_count: number;
  skipped_entries: number;
  applied_regime?: string;
  entry_batch: ThreadTimelineEntryPayload[];
  exit_batch: ThreadTimelineExitPayload[];
  open_positions: ThreadTimelineOpenPositionPayload[];
}

export interface ThreadTimelinePayload {
  meta: {
    catalog_id: string;
    catalog_hash: string;
    strategy_id: string;
    label: string;
    symbol: string;
    thread_count: number;
    stop_sessions: number;
    period_start: string;
    period_end: string;
    data_hash: string;
    config_hash: string;
    code_commit: string;
    execution_model: string;
    price_basis: string;
    commission_bps: string;
    transaction_tax_bps: string;
    slippage_bps: string;
    regime_enabled?: boolean;
    regime_symbol?: string;
    regime_data_hash?: string | null;
    regime_config_hash?: string | null;
  };
  lanes: ThreadTimelineLanePayload[];
  sessions: ThreadTimelineSessionPayload[];
  summary: {
    max_open_threads: number;
    entry_sessions: number;
    exit_sessions: number;
    total_entries: number;
    total_exits: number;
    latest_open_threads: number;
  };
}

export interface ParameterSweepRowPayload {
  combo_key: string;
  config_hash: string;
  params: {
    thread_count: number;
    stop_sessions: number;
    buy_pct: number;
    sell_pct: number;
  };
  metrics: {
    full_return_pct: number;
    cagr_pct: number;
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

export type ResearchArtifactKind = "STRATEGY_EXPLORER" | "STRATEGY_RANKING" | "PARAMETER_SWEEP";

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
