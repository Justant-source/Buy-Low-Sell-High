from __future__ import annotations

from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass
from itertools import product
from math import ceil
import os
from typing import Any, Callable, TypeVar

MAX_SWEEP_WORKERS = 16

SweepParamRow = dict[str, Any]
RowT = TypeVar("RowT")


@dataclass(frozen=True)
class SweepSpec:
    sweep_id: str
    strategy_family: str
    parameter_keys: tuple[str, ...]
    parameter_values: dict[str, tuple[Any, ...]]
    fixed_values: dict[str, Any]
    spec_version: str = "v1"


@dataclass(frozen=True)
class SweepExecutionPlan:
    sweep_id: str
    strategy_family: str
    spec_version: str
    combo_count: int
    requested_max_workers: int | None
    max_workers: int
    chunk_size: int
    chunk_count: int
    parameter_keys: tuple[str, ...]
    parameter_values: dict[str, list[Any]]


def build_sweep_spec(
    *,
    sweep_id: str,
    strategy_family: str,
    parameter_keys: tuple[str, ...],
    parameter_values: dict[str, list[Any] | tuple[Any, ...]],
    fixed_values: dict[str, Any] | None = None,
    spec_version: str = "v1",
) -> SweepSpec:
    return SweepSpec(
        sweep_id=sweep_id,
        strategy_family=strategy_family,
        parameter_keys=parameter_keys,
        parameter_values={key: tuple(parameter_values[key]) for key in parameter_keys},
        fixed_values=dict(fixed_values or {}),
        spec_version=spec_version,
    )


def iter_sweep_parameter_rows(spec: SweepSpec) -> list[SweepParamRow]:
    rows: list[SweepParamRow] = []
    for combo in product(*(spec.parameter_values[key] for key in spec.parameter_keys)):
        rows.append(dict(zip(spec.parameter_keys, combo, strict=True)))
    return rows


def resolve_sweep_max_workers(requested_max_workers: int | None, combo_count: int) -> int:
    if combo_count <= 1:
        return 1
    if requested_max_workers is not None and requested_max_workers > 0:
        return max(1, min(combo_count, requested_max_workers, MAX_SWEEP_WORKERS))
    cpu_count = os.cpu_count() or 1
    auto_workers = cpu_count - 1 if cpu_count > 1 else 1
    return max(1, min(combo_count, auto_workers, MAX_SWEEP_WORKERS))


def resolve_sweep_chunk_size(combo_count: int, max_workers: int, requested_chunk_size: int | None) -> int:
    if combo_count <= 1:
        return 1
    if requested_chunk_size is not None and requested_chunk_size > 0:
        return max(1, min(combo_count, requested_chunk_size))
    if max_workers <= 1:
        return combo_count
    return max(1, ceil(combo_count / (max_workers * 4)))


def build_sweep_execution_plan(
    spec: SweepSpec,
    *,
    max_workers: int | None = None,
    chunk_size: int | None = None,
) -> tuple[SweepExecutionPlan, list[SweepParamRow], list[list[SweepParamRow]]]:
    parameter_rows = iter_sweep_parameter_rows(spec)
    combo_count = len(parameter_rows)
    worker_count = resolve_sweep_max_workers(max_workers, combo_count)
    resolved_chunk_size = resolve_sweep_chunk_size(combo_count, worker_count, chunk_size)
    chunks = chunk_sweep_parameter_rows(parameter_rows, resolved_chunk_size)
    plan = SweepExecutionPlan(
        sweep_id=spec.sweep_id,
        strategy_family=spec.strategy_family,
        spec_version=spec.spec_version,
        combo_count=combo_count,
        requested_max_workers=max_workers if max_workers and max_workers > 0 else None,
        max_workers=worker_count,
        chunk_size=resolved_chunk_size,
        chunk_count=len(chunks),
        parameter_keys=spec.parameter_keys,
        parameter_values={key: list(spec.parameter_values[key]) for key in spec.parameter_keys},
    )
    return plan, parameter_rows, chunks


def chunk_sweep_parameter_rows(rows: list[SweepParamRow], chunk_size: int) -> list[list[SweepParamRow]]:
    if not rows:
        return []
    return [rows[index : index + chunk_size] for index in range(0, len(rows), chunk_size)]


def _run_chunk_task(task: tuple[Callable[..., list[RowT]], list[SweepParamRow], dict[str, Any]]) -> list[RowT]:
    worker_fn, chunk, worker_kwargs = task
    return worker_fn(chunk, **worker_kwargs)


def execute_sweep_chunks(
    chunks: list[list[SweepParamRow]],
    *,
    worker_fn: Callable[..., list[RowT]],
    worker_kwargs: dict[str, Any] | None = None,
    max_workers: int = 1,
) -> list[RowT]:
    if not chunks:
        return []
    resolved_kwargs = dict(worker_kwargs or {})
    if max_workers <= 1 or len(chunks) == 1:
        rows: list[RowT] = []
        for chunk in chunks:
            rows.extend(worker_fn(chunk, **resolved_kwargs))
        return rows
    tasks = [(worker_fn, chunk, resolved_kwargs) for chunk in chunks]
    rows: list[RowT] = []
    with ProcessPoolExecutor(max_workers=max_workers) as executor:
        for batch in executor.map(_run_chunk_task, tasks):
            rows.extend(batch)
    return rows
