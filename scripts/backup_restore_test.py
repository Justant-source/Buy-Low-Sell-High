from __future__ import annotations

from datetime import UTC, datetime
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import sys

from soxl_mania.manual.ledger import (
    create_ledger,
    export_ledger,
    import_ledger,
    load_ledger,
    record_fill,
    reverse_fill,
    save_ledger,
)


def main() -> int:
    with TemporaryDirectory() as temp_dir:
        temp_root = Path(temp_dir)
        original_path = temp_root / "ledger.json"
        backup_path = temp_root / "ledger-backup.json"

        ledger = create_ledger("backup_restore_test", 2, 1000)
        fill = record_fill(
            ledger,
            thread_id=1,
            side="BUY",
            quantity="8",
            price="12.50",
            fee="0",
            filled_at=datetime(2026, 6, 19, tzinfo=UTC),
        )
        reverse_fill(ledger, fill.fill_id)
        save_ledger(original_path, ledger)

        original_export = export_ledger(ledger)
        backup_path.write_text(original_export, encoding="utf-8")

        mutated = load_ledger(original_path)
        record_fill(
            mutated,
            thread_id=2,
            side="BUY",
            quantity="3",
            price="20",
            fee="0",
            filled_at=datetime(2026, 6, 20, tzinfo=UTC),
        )
        save_ledger(original_path, mutated)

        restored = import_ledger(backup_path.read_text(encoding="utf-8"))
        save_ledger(original_path, restored)
        final_export = original_path.read_text(encoding="utf-8")

        if json.loads(final_export) != json.loads(original_export):
            raise SystemExit("backup restore round-trip mismatch")

        print(
            json.dumps(
                {
                    "status": "ok",
                    "original_fill_count": len(ledger.fills),
                    "restored_fill_count": len(restored.fills),
                    "ledger_path": str(original_path),
                    "backup_path": str(backup_path),
                },
                indent=2,
            )
        )
        return 0


if __name__ == "__main__":
    sys.exit(main())
