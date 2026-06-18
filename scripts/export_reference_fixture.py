from __future__ import annotations

from pathlib import Path
import json
import sys


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    fixture = root / "engine" / "tests" / "fixtures" / "mentor_reference_2011_2024.json"
    payload = json.loads(fixture.read_text(encoding="utf-8"))
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
