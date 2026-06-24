from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime
import json
from pathlib import Path
import subprocess
from typing import Any

from ..data.sync import snapshot_manifest_path, sync_history
from ..symbols import default_market_data_csv, repo_root


@dataclass(frozen=True)
class SyncTarget:
    symbol: str
    depends_on_symbols: tuple[str, ...] = ()


@dataclass(frozen=True)
class MaterializationTarget:
    workspace_id: str
    profile_id: str
    dependency_symbols: tuple[str, ...]


@dataclass(frozen=True)
class MarketRefreshDefinition:
    market: str
    cron_timezone: str
    cron_schedule: str
    sync_targets: tuple[SyncTarget, ...]
    materialization_targets: tuple[MaterializationTarget, ...]


@dataclass(frozen=True)
class ManifestSnapshot:
    data_hash: str | None
    end: str | None
    rows: int | None
    source: str | None
    manifest_path: str | None


def market_refresh_config_path() -> Path:
    return repo_root() / "configs" / "automation" / "market_refresh.json"


def _load_market_refresh_config() -> dict[str, Any]:
    return json.loads(market_refresh_config_path().read_text(encoding="utf-8"))


def load_market_refresh_definition(market: str) -> MarketRefreshDefinition:
    payload = _load_market_refresh_config()
    markets = payload.get("markets", {})
    key = market.lower()
    if key not in markets:
        raise ValueError(f"Unknown market refresh config: {market}")
    raw = markets[key]
    sync_targets = tuple(
        SyncTarget(
            symbol=str(item["symbol"]).upper(),
            depends_on_symbols=tuple(str(symbol).upper() for symbol in item.get("depends_on_symbols", [])),
        )
        for item in raw.get("sync_targets", [])
    )
    materialization_targets = tuple(
        MaterializationTarget(
            workspace_id=str(item["workspace_id"]),
            profile_id=str(item["profile_id"]),
            dependency_symbols=tuple(str(symbol).upper() for symbol in item.get("dependency_symbols", [])),
        )
        for item in raw.get("materialization_targets", [])
    )
    return MarketRefreshDefinition(
        market=key,
        cron_timezone=str(raw["cron_timezone"]),
        cron_schedule=str(raw["cron_schedule"]),
        sync_targets=sync_targets,
        materialization_targets=materialization_targets,
    )


def resolve_sync_batches(sync_targets: tuple[SyncTarget, ...]) -> tuple[tuple[str, ...], ...]:
    remaining = {target.symbol: {symbol for symbol in target.depends_on_symbols if symbol in {item.symbol for item in sync_targets}} for target in sync_targets}
    batches: list[tuple[str, ...]] = []
    while remaining:
        ready = tuple(sorted(symbol for symbol, deps in remaining.items() if not deps))
        if not ready:
            raise ValueError(f"Cyclic sync dependency graph: {remaining}")
        batches.append(ready)
        ready_set = set(ready)
        remaining = {
            symbol: deps - ready_set
            for symbol, deps in remaining.items()
            if symbol not in ready_set
        }
    return tuple(batches)


def resolve_impacted_materialization_targets(
    targets: tuple[MaterializationTarget, ...],
    changed_symbols: set[str],
) -> tuple[MaterializationTarget, ...]:
    if not changed_symbols:
        return ()
    return tuple(
        target
        for target in targets
        if changed_symbols.intersection(target.dependency_symbols)
    )


def load_manifest_snapshot(symbol: str) -> ManifestSnapshot | None:
    manifest_path = snapshot_manifest_path(default_market_data_csv(symbol))
    if not manifest_path.exists():
        return None
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    return ManifestSnapshot(
        data_hash=payload.get("data_hash"),
        end=payload.get("end"),
        rows=payload.get("rows"),
        source=payload.get("source"),
        manifest_path=str(manifest_path.resolve()),
    )


def classify_manifest_change(before: ManifestSnapshot | None, after: ManifestSnapshot | None) -> str:
    if after is None:
        return "FAILED"
    if before is None:
        return "UPDATED"
    if before.data_hash == after.data_hash and before.end == after.end:
        return "UNCHANGED"
    return "UPDATED"


def _serialize_snapshot(snapshot: ManifestSnapshot | None) -> dict[str, Any] | None:
    if snapshot is None:
        return None
    return {
        "data_hash": snapshot.data_hash,
        "end": snapshot.end,
        "rows": snapshot.rows,
        "source": snapshot.source,
        "manifest_path": snapshot.manifest_path,
    }


def _sync_symbol(symbol: str) -> dict[str, Any]:
    before = load_manifest_snapshot(symbol)
    try:
        result = sync_history(default_market_data_csv(symbol), symbol=symbol)
        after = load_manifest_snapshot(symbol)
        return {
            "symbol": symbol,
            "status": classify_manifest_change(before, after),
            "before": _serialize_snapshot(before),
            "after": _serialize_snapshot(after),
            "source": result.get("source"),
            "rows": result.get("rows"),
            "start": result.get("start"),
            "end": result.get("end"),
            "data_hash": result.get("data_hash"),
            "output_csv": result.get("output_csv"),
            "manifest_path": result.get("manifest_path"),
            "warnings": list(result.get("warnings", [])),
            "errors": list(result.get("errors", [])),
        }
    except Exception as exc:
        after = load_manifest_snapshot(symbol)
        return {
            "symbol": symbol,
            "status": "FAILED",
            "before": _serialize_snapshot(before),
            "after": _serialize_snapshot(after),
            "warnings": [],
            "errors": [str(exc)],
        }


def _run_sync_batches(
    definition: MarketRefreshDefinition,
    *,
    max_sync_workers: int,
) -> list[dict[str, Any]]:
    batches = resolve_sync_batches(definition.sync_targets)
    ordered_results: list[dict[str, Any]] = []
    for batch in batches:
        worker_count = max(1, min(max_sync_workers, len(batch)))
        if worker_count == 1:
            ordered_results.extend(_sync_symbol(symbol) for symbol in batch)
            continue
        with ThreadPoolExecutor(max_workers=worker_count) as executor:
            futures = {
                symbol: executor.submit(_sync_symbol, symbol)
                for symbol in batch
            }
            ordered_results.extend(futures[symbol].result() for symbol in batch)
    return ordered_results


def _dashboard_exec_path() -> Path:
    return repo_root() / "scripts" / "dashboard_exec.sh"


def _run_dashboard_build() -> dict[str, Any]:
    completed = subprocess.run(
        [str(_dashboard_exec_path()), "build"],
        cwd=repo_root(),
        capture_output=True,
        text=True,
        check=False,
    )
    return {
        "command": [str(_dashboard_exec_path()), "build"],
        "exit_code": completed.returncode,
        "stdout": completed.stdout if completed.returncode != 0 else "",
        "stderr": completed.stderr if completed.returncode != 0 else "",
    }


def _run_market_materialization(
    market: str,
    *,
    profile_ids: tuple[str, ...],
    max_materialize_workers: int,
    sweep_max_workers: int,
    sweep_chunk_size: int,
) -> dict[str, Any]:
    build_result = _run_dashboard_build()
    if build_result["exit_code"] != 0:
        return {
            "status": "FAILED",
            "build": build_result,
            "command": None,
            "payload": None,
            "error": "Dashboard build failed before market materialization",
        }

    command = [
        str(_dashboard_exec_path()),
        "node",
        "dashboard/dist/materialize-market.js",
        "--market",
        market,
        "--max-workers",
        str(max_materialize_workers),
    ]
    for profile_id in profile_ids:
        command.extend(["--profile-id", profile_id])
    if sweep_max_workers > 0:
        command.extend(["--sweep-max-workers", str(sweep_max_workers)])
    if sweep_chunk_size > 0:
        command.extend(["--sweep-chunk-size", str(sweep_chunk_size)])

    completed = subprocess.run(
        command,
        cwd=repo_root(),
        capture_output=True,
        text=True,
        check=False,
    )
    payload: dict[str, Any] | None = None
    error: str | None = None
    if completed.stdout.strip():
        try:
            payload = json.loads(completed.stdout)
        except json.JSONDecodeError as exc:
            error = f"Invalid JSON from materialize-market: {exc}"
    if completed.returncode != 0 and error is None:
        error = "Market materialization command failed"
    return {
        "status": "FAILED" if completed.returncode != 0 or error else "COMPLETED",
        "build": build_result,
        "command": command,
        "exit_code": completed.returncode,
        "payload": payload,
        "stdout": completed.stdout if completed.returncode != 0 or error else "",
        "stderr": completed.stderr if completed.returncode != 0 or error else "",
        "error": error,
    }


def refresh_market(
    market: str,
    *,
    skip_materialize: bool = False,
    force_materialize: bool = False,
    max_sync_workers: int = 4,
    max_materialize_workers: int = 8,
    sweep_max_workers: int = 0,
    sweep_chunk_size: int = 0,
) -> tuple[int, dict[str, Any]]:
    definition = load_market_refresh_definition(market)
    sync_results = _run_sync_batches(definition, max_sync_workers=max_sync_workers)
    changed_symbols = sorted(result["symbol"] for result in sync_results if result["status"] == "UPDATED")
    failed_symbols = sorted(result["symbol"] for result in sync_results if result["status"] == "FAILED")
    changed_symbol_set = set(changed_symbols)
    if force_materialize:
        impacted_targets = definition.materialization_targets
        materialize_reason = "force_materialize"
    else:
        impacted_targets = resolve_impacted_materialization_targets(definition.materialization_targets, changed_symbol_set)
        materialize_reason = "changed_symbols" if impacted_targets else "no_impacted_targets"

    materialization: dict[str, Any]
    if skip_materialize:
        materialization = {
            "status": "SKIPPED",
            "reason": "skip_materialize",
            "requested_profile_ids": [],
            "impacted_workspace_ids": [],
        }
    elif not impacted_targets:
        materialization = {
            "status": "SKIPPED",
            "reason": materialize_reason,
            "requested_profile_ids": [],
            "impacted_workspace_ids": [],
        }
    else:
        requested_profile_ids = tuple(target.profile_id for target in impacted_targets)
        impacted_workspace_ids = sorted({target.workspace_id for target in impacted_targets})
        materialization = {
            "status": "REQUESTED",
            "reason": materialize_reason,
            "requested_profile_ids": list(requested_profile_ids),
            "impacted_workspace_ids": impacted_workspace_ids,
            "result": _run_market_materialization(
                definition.market,
                profile_ids=requested_profile_ids,
                max_materialize_workers=max_materialize_workers,
                sweep_max_workers=sweep_max_workers,
                sweep_chunk_size=sweep_chunk_size,
            ),
        }

    exit_code = 0
    if failed_symbols:
        exit_code = 1
    if materialization.get("status") == "REQUESTED" and materialization["result"].get("status") != "COMPLETED":
        exit_code = 1
    requested_profile_ids = materialization.get("requested_profile_ids", [])
    summary = {
        "market": definition.market,
        "requested_at": datetime.now(UTC).isoformat(),
        "cron_timezone": definition.cron_timezone,
        "cron_schedule": definition.cron_schedule,
        "sync_batches": [list(batch) for batch in resolve_sync_batches(definition.sync_targets)],
        "sync": {
            "results": sync_results,
            "changed_symbols": changed_symbols,
            "failed_symbols": failed_symbols,
            "updated_count": len(changed_symbols),
            "failed_count": len(failed_symbols),
            "unchanged_count": sum(1 for result in sync_results if result["status"] == "UNCHANGED"),
        },
        "materialization": materialization,
        "requested_profile_count": len(requested_profile_ids),
    }
    return exit_code, summary
