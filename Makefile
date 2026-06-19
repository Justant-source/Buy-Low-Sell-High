PYTHON := python3
NPM := npm
PYTHONPATH := engine/src

.PHONY: bootstrap-check lint-docs test smoke test-data test-strategy test-backtest test-manual test-integration typecheck lint ci dashboard-build dashboard-test e2e clean-room migrate worker-smoke scenario-report e2e-backtest e2e-manual e2e-risk backup restore-test reference-check backtest-reference backtest-grid backtest-run data-import data-sync data-validate dashboard worker docker-init docker-sync docker-backtest

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
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m soxl_mania.cli data sync --symbol SOXL --start-date 2011-01-01

backtest-run:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m soxl_mania.cli backtest run --profile configs/strategies/mentor_default_5x30.yaml --symbol SOXL

data-validate:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m soxl_mania.cli data validate --symbol SOXL

test-data test-strategy test-backtest test-manual test-integration:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m unittest discover -s engine/tests/unit -p 'test_*.py'

worker-smoke:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m soxl_mania.cli worker smoke

reference-check backtest-reference:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m soxl_mania.cli parity report --reference engine/tests/fixtures/mentor_reference_2011_2024.json --profile configs/strategies/mentor_default_5x30.yaml --csv engine/tests/fixtures/sample_soxl.csv --symbol SOXL

backtest-grid:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m soxl_mania.cli backtest grid --profile configs/strategies/mentor_default_5x30.yaml --csv engine/tests/fixtures/sample_soxl.csv --threads 5,6,7 --stops 10,30,40

scenario-report:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) -m soxl_mania.cli backtest risk-report --profile configs/strategies/mentor_default_5x30.yaml --csv engine/tests/fixtures/sample_soxl.csv --symbol SOXL

e2e-backtest:
	./scripts/e2e_backtest.sh

e2e-manual:
	./scripts/e2e_manual.sh

e2e-risk:
	./scripts/e2e_risk.sh

backup:
	$(PYTHON) scripts/backup_runtime_ledgers.py

restore-test:
	PYTHONPATH=$(PYTHONPATH) $(PYTHON) scripts/backup_restore_test.py

backup-restore-test: restore-test

e2e: e2e-backtest e2e-manual e2e-risk

clean-room: bootstrap-check dashboard-build dashboard-test scenario-report e2e

ci: clean-room reference-check backup-restore-test

docker-init:
	./scripts/docker_init.sh

docker-sync:
	./scripts/docker_sync_soxl.sh

docker-backtest:
	./scripts/docker_backtest_soxl.sh

dashboard-build:
	$(NPM) --prefix dashboard run build

dashboard-test:
	$(NPM) --prefix dashboard test

dashboard migrate typecheck lint worker:
	@echo "Command scaffolded but not executable in this minimal environment"
