from __future__ import annotations

from dataclasses import asdict
from pathlib import Path
from typing import Any

from .domain.models import StrategyConfig


def load_simple_yaml(path: str | Path) -> dict[str, Any]:
    data: dict[str, Any] = {}
    for raw_line in Path(path).read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            raise ValueError(f"Unsupported config line: {raw_line}")
        key, value = line.split(":", 1)
        data[key.strip()] = _parse_scalar(value.strip())
    return data


def _parse_scalar(value: str) -> Any:
    lowered = value.lower()
    if lowered in {"true", "false"}:
        return lowered == "true"
    if value.isdigit():
        return int(value)
    try:
        return float(value)
    except ValueError:
        return value


def load_strategy_config(path: str | Path, *, initial_capital: float = 10_000.0) -> StrategyConfig:
    payload = load_simple_yaml(path)
    payload["initial_capital"] = payload.get("initial_capital", initial_capital)
    return StrategyConfig.from_mapping(payload)


def strategy_config_to_dict(config: StrategyConfig) -> dict[str, Any]:
    return asdict(config)

