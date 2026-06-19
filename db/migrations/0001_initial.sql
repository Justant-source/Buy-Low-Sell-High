CREATE TABLE IF NOT EXISTS market_bars (
    symbol VARCHAR NOT NULL,
    session_date DATE NOT NULL,
    open NUMERIC NOT NULL,
    high NUMERIC NOT NULL,
    low NUMERIC NOT NULL,
    close NUMERIC NOT NULL,
    adj_close NUMERIC NOT NULL,
    volume BIGINT NOT NULL DEFAULT 0,
    dividend NUMERIC NOT NULL DEFAULT 0,
    split_ratio NUMERIC NOT NULL DEFAULT 1,
    source VARCHAR NOT NULL,
    source_row_hash CHAR(64),
    import_id UUID,
    PRIMARY KEY (symbol, session_date, source)
);

CREATE TABLE IF NOT EXISTS data_imports (
    id UUID PRIMARY KEY,
    symbol VARCHAR NOT NULL,
    source VARCHAR NOT NULL,
    data_hash CHAR(64) NOT NULL,
    status VARCHAR NOT NULL,
    row_count INT NOT NULL,
    created_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS backtest_jobs (
    id UUID PRIMARY KEY,
    config_hash CHAR(64) NOT NULL,
    data_hash CHAR(64) NOT NULL,
    status VARCHAR NOT NULL,
    requested_at TIMESTAMP NOT NULL,
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
    error_message TEXT,
    progress INT NOT NULL DEFAULT 0
);

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
);

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
);

CREATE INDEX IF NOT EXISTS backtest_research_artifacts_kind_created_idx
    ON backtest_research_artifacts (artifact_kind, created_at DESC);
