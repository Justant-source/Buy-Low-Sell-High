PYTHON := python3
NPM := npm
PYTHONPATH := engine/src

.PHONY: bootstrap-check lint-docs test smoke test-data test-strategy test-backtest test-integration typecheck lint ci dashboard-build dashboard-test e2e clean-room migrate worker-smoke scenario-report e2e-backtest e2e-risk reference-check backtest-reference backtest-grid backtest-run official-explorer official-matrix official-reference-check legacy-mentor-compare mentor-matrix parity-mentor-matrix mentor-floor data-import data-sync data-validate dashboard worker docker-init docker-sync docker-backtest

bootstrap-check:
	$(PYTHON) scripts/verify_no_autotrading.py
	$(PYTHON) scripts/lint_docs.py
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m unittest discover -s engine/tests/unit -p 'test_*.py'
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m buy_low_sell_high.cli bootstrap-check
	$(MAKE) official-reference-check

lint-docs:
	$(PYTHON) scripts/lint_docs.py

test: smoke

smoke:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m unittest discover -s engine/tests/unit -p 'test_*.py'

data-import:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m buy_low_sell_high.cli data status --csv engine/tests/fixtures/sample_soxl.csv --symbol SOXL

data-sync:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m buy_low_sell_high.cli data sync --symbol SOXL --start-date 2011-01-01

backtest-run:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m buy_low_sell_high.cli backtest run --profile configs/strategies/soxl_official_ddeolsao_pal_v1.yaml --symbol SOXL

data-validate:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m buy_low_sell_high.cli data validate --symbol SOXL

test-data test-strategy test-backtest test-integration:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m unittest discover -s engine/tests/unit -p 'test_*.py'

worker-smoke:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m buy_low_sell_high.cli worker smoke

reference-check backtest-reference official-reference-check:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -c 'from buy_low_sell_high.config import load_strategy_config; from buy_low_sell_high.data.normalize import normalize_bars; from buy_low_sell_high.data.providers.csv_provider import CsvMarketDataProvider; from buy_low_sell_high.data.quality import compute_data_hash; from buy_low_sell_high.reporting.official_explorer import build_official_explorer; from buy_low_sell_high.reporting.official_matrix import build_official_matrix, compare_to_reference, load_explorer_reference_fixture, load_reference_fixture; bars = normalize_bars(CsvMarketDataProvider("data/raw/soxl_daily_2011_present.csv").load_bars("SOXL")); config = load_strategy_config("configs/strategies/soxl_official_ddeolsao_pal_v1.yaml", initial_capital=10000); data_hash = compute_data_hash(bars); matrix = build_official_matrix(bars, config, data_hash=data_hash); explorer = build_official_explorer(bars, config, data_hash=data_hash); matrix_result = compare_to_reference(matrix, load_reference_fixture()); explorer_result = compare_to_reference(explorer, load_explorer_reference_fixture()); print("matrix", matrix_result["status"]); print("matrix_first_mismatch", matrix_result["first_mismatch"]) if matrix_result["first_mismatch"] else None; print("explorer", explorer_result["status"]); print("explorer_first_mismatch", explorer_result["first_mismatch"]) if explorer_result["first_mismatch"] else None; raise SystemExit(0 if matrix_result["status"] == "PASS" and explorer_result["status"] == "PASS" else 1)'

backtest-grid:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m buy_low_sell_high.cli backtest grid --profile configs/strategies/soxl_official_ddeolsao_pal_v1.yaml --csv engine/tests/fixtures/sample_soxl.csv --threads 5,6,7 --stops 10,30,40

official-explorer:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m buy_low_sell_high.cli backtest official-explorer --profile configs/strategies/soxl_official_ddeolsao_pal_v1.yaml --csv data/raw/soxl_daily_2011_present.csv --symbol SOXL

official-matrix:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m buy_low_sell_high.cli backtest official-matrix --profile configs/strategies/soxl_official_ddeolsao_pal_v1.yaml --csv data/raw/soxl_daily_2011_present.csv --symbol SOXL --threads 5,6,7 --stops 10,30,40

mentor-matrix:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m buy_low_sell_high.cli backtest mentor-matrix --profile configs/strategies/soxl_default_5x30.yaml --csv engine/tests/fixtures/sample_soxl.csv --symbol SOXL

legacy-mentor-compare:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -c 'from buy_low_sell_high.config import load_strategy_config; from buy_low_sell_high.data.normalize import normalize_bars; from buy_low_sell_high.data.providers.csv_provider import CsvMarketDataProvider; from buy_low_sell_high.data.quality import compute_data_hash; from buy_low_sell_high.reporting.mentor_matrix import build_mentor_matrix; bars = normalize_bars(CsvMarketDataProvider("data/raw/soxl_daily_2011_present.csv").load_bars("SOXL")); bars = [bar for bar in bars if bar.session_date.year <= 2024]; config = load_strategy_config("configs/strategies/soxl_default_5x30.yaml", initial_capital=10000); payload = build_mentor_matrix(bars, config, data_hash=compute_data_hash(bars)); print("parity", payload["parity"]["status"]); print("parity_first_mismatch", payload["parity"]["first_mismatch"]) if payload["parity"]["first_mismatch"] else None; print("mentor_floor", payload["mentor_floor"]["status"]); print("failure_count", payload["mentor_floor"]["failure_count"]); print("combo_failure_counts", payload["mentor_floor"]["combo_failure_counts"]); print("worst_mismatches", payload["mentor_floor"]["worst_mismatches"][:5]) if payload["mentor_floor"]["worst_mismatches"] else None'

parity-mentor-matrix:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -c 'from buy_low_sell_high.config import load_strategy_config; from buy_low_sell_high.data.normalize import normalize_bars; from buy_low_sell_high.data.providers.csv_provider import CsvMarketDataProvider; from buy_low_sell_high.data.quality import compute_data_hash; from buy_low_sell_high.reporting.mentor_matrix import build_mentor_matrix; bars = normalize_bars(CsvMarketDataProvider("data/raw/soxl_daily_2011_present.csv").load_bars("SOXL")); bars = [bar for bar in bars if bar.session_date.year <= 2024]; config = load_strategy_config("configs/strategies/soxl_default_5x30.yaml", initial_capital=10000); payload = build_mentor_matrix(bars, config, data_hash=compute_data_hash(bars)); print(payload["parity"]["status"]); print(payload["parity"]["first_mismatch"]) if payload["parity"]["first_mismatch"] else None; raise SystemExit(0 if payload["parity"]["status"] == "PASS" else 1)'

mentor-floor:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -c 'from buy_low_sell_high.config import load_strategy_config; from buy_low_sell_high.data.normalize import normalize_bars; from buy_low_sell_high.data.providers.csv_provider import CsvMarketDataProvider; from buy_low_sell_high.data.quality import compute_data_hash; from buy_low_sell_high.reporting.mentor_matrix import build_mentor_matrix; bars = normalize_bars(CsvMarketDataProvider("data/raw/soxl_daily_2011_present.csv").load_bars("SOXL")); bars = [bar for bar in bars if bar.session_date.year <= 2024]; config = load_strategy_config("configs/strategies/soxl_default_5x30.yaml", initial_capital=10000); payload = build_mentor_matrix(bars, config, data_hash=compute_data_hash(bars)); floor = payload["mentor_floor"]; print(floor["status"]); print("failure_count", floor["failure_count"]); print("combo_failure_counts", floor["combo_failure_counts"]); print("first_mismatch", floor["first_mismatch"]) if floor["first_mismatch"] else None; print("worst_mismatches", floor["worst_mismatches"][:5]) if floor["worst_mismatches"] else None; raise SystemExit(0 if floor["status"] == "PASS" else 1)'

scenario-report:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m buy_low_sell_high.cli backtest risk-report --profile configs/strategies/soxl_official_ddeolsao_pal_v1.yaml --csv engine/tests/fixtures/sample_soxl.csv --symbol SOXL

e2e-backtest:
	./scripts/e2e_backtest.sh

e2e-risk:
	./scripts/e2e_risk.sh

e2e: e2e-backtest e2e-risk

clean-room: bootstrap-check dashboard-build dashboard-test scenario-report e2e

ci: clean-room

docker-init:
	./scripts/docker_init.sh

docker-sync:
	./scripts/docker_sync_symbol.sh

docker-backtest:
	./scripts/docker_backtest_default.sh

dashboard-build:
	$(NPM) --prefix dashboard run build

dashboard-test:
	$(NPM) --prefix dashboard test

dashboard migrate typecheck lint worker:
	@echo "Command scaffolded but not executable in this minimal environment"
