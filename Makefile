PYTHON := python3
PYTHONPATH := engine/src

.PHONY: bootstrap-check lint-docs test smoke test-data test-strategy test-backtest test-manual test-integration typecheck lint ci dashboard-build dashboard-test e2e clean-room migrate worker-smoke scenario-report e2e-backtest e2e-manual e2e-risk backup restore-test reference-check backtest-reference backtest-grid data-import data-validate dashboard worker

bootstrap-check:
	$(PYTHON) scripts/verify_no_autotrading.py
	$(PYTHON) scripts/lint_docs.py
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m unittest discover -s engine/tests/unit -p 'test_*.py'
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m soxl_mania.cli bootstrap-check

lint-docs:
	$(PYTHON) scripts/lint_docs.py

test: smoke

smoke:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m unittest discover -s engine/tests/unit -p 'test_*.py'

data-import:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m soxl_mania.cli data status --csv engine/tests/fixtures/sample_soxl.csv --symbol SOXL

data-sync:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m soxl_mania.cli data sync --output-csv data/raw/soxl_daily_2011_present.csv --symbol SOXL --start-date 2011-01-01

data-validate:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m soxl_mania.cli data validate --csv engine/tests/fixtures/sample_soxl.csv --symbol SOXL

test-data test-strategy test-backtest test-manual test-integration:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m unittest discover -s engine/tests/unit -p 'test_*.py'

worker-smoke:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m soxl_mania.cli worker smoke

reference-check backtest-reference:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m soxl_mania.cli parity report --reference engine/tests/fixtures/mentor_reference_2011_2024.json --profile configs/strategies/mentor_default_5x30.yaml --csv engine/tests/fixtures/sample_soxl.csv --symbol SOXL

backtest-grid:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m soxl_mania.cli backtest grid --profile configs/strategies/mentor_default_5x30.yaml --csv engine/tests/fixtures/sample_soxl.csv --threads 5,6,7 --stops 10,30,40

dashboard-build dashboard-test e2e e2e-backtest e2e-manual e2e-risk dashboard backup restore-test scenario-report migrate typecheck lint clean-room ci worker:
	@echo "Command scaffolded but not executable in this minimal environment"
