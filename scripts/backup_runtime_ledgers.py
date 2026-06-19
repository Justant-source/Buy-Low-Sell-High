from __future__ import annotations

from datetime import UTC, datetime
import json
from pathlib import Path
import shutil
import sys


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    source_root = root / "data" / "runtime" / "dashboard"
    target_root = root / "data" / "runtime" / "backups"
    target_root.mkdir(parents=True, exist_ok=True)

    ledger_paths = sorted(source_root.glob("manual-ledger-*.json"))
    if not ledger_paths:
        print(json.dumps({"backups": [], "message": "no ledger files found"}, indent=2))
        return 0

    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    backups: list[dict[str, str]] = []
    for ledger_path in ledger_paths:
        backup_path = target_root / f"{ledger_path.stem}-{timestamp}.json"
        shutil.copy2(ledger_path, backup_path)
        backups.append(
            {
                "source": str(ledger_path.resolve()),
                "backup": str(backup_path.resolve()),
            }
        )

    print(json.dumps({"backups": backups, "count": len(backups)}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
