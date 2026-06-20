from __future__ import annotations

from pathlib import Path


def schema_sql() -> str:
    return (Path(__file__).resolve().parents[3] / "db" / "migrations" / "0001_initial.sql").read_text(
        encoding="utf-8"
    )

