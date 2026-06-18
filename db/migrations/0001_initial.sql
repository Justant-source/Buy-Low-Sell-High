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

