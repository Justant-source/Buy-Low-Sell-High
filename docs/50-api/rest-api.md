# REST API

The dashboard API is served by the Express app in `dashboard/src/server.ts` and uses the Python CLI as its execution boundary. Responses that represent research runs carry reproducibility metadata such as `config_hash`, `data_hash`, and `code_commit`.

## Health
- `GET /api/health`
  - Dashboard process status, phase label, and uptime seconds.

## Data
- `GET /api/data/status`
  - Returns `symbol`, `rows`, `start`, `end`, `data_hash`, `source`, `warnings`, and `snapshot_path`.

## Profiles
- `GET /api/profiles`
  - Returns `defaultProfileId` plus the hydrated strategy profiles used by the dashboard.
- `GET /api/profiles/:profileId`
  - Returns a single hydrated profile including `configHash` and `initialCapital`.

## Backtests
- `GET /api/backtests`
  - Returns recent jobs, lightweight run summaries, and the latest full run artifact.
- `POST /api/backtests/jobs`
  - Creates a queued dashboard job for a single detailed backtest run.
- `GET /api/backtests/jobs/:jobId`
  - Returns job state, timestamps, progress, and `runId` when complete.
- `GET /api/backtests/runs/:runId`
  - Returns the persisted full run artifact with metrics, yearly table, daily series, and trades.
- `GET /api/backtests/runs/:runId/trades.csv`
  - Exports the persisted trades as CSV.
- `GET /api/backtests/compare`
  - Returns the 9-cell thread/stop comparison matrix payload for the selected profile and dataset.

## Manual Operations
- `GET /api/manual/ledger`
  - Returns the selected profile ledger path plus summary, issues, thread states, and fill history.
- `GET /api/manual/today`
  - Returns the selected profile ledger path plus today recommendations.
- `POST /api/manual/fills`
  - Appends a manual fill to the ledger.
- `POST /api/manual/fills/:fillId/reverse`
  - Appends a reversal fill and links it to the original fill.
