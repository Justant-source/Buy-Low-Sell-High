from __future__ import annotations

from pathlib import Path
import sys


REQUIRED_DOCS = [
    "docs/_index.md",
    "docs/10-context/system-context.md",
    "docs/20-containers/containers.md",
    "docs/30-components/components.md",
    "docs/40-data/data-model.md",
    "docs/50-api/rest-api.md",
    "docs/60-runtime/state-machines.md",
    "docs/70-policy/strategy.md",
    "docs/70-policy/backtest-methodology.md",
]


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    missing = [path for path in REQUIRED_DOCS if not (root / path).exists()]
    if missing:
        for path in missing:
            print(f"MISSING_DOC: {path}")
        return 1

    index_text = (root / "docs/_index.md").read_text(encoding="utf-8")
    failures = [path for path in REQUIRED_DOCS[1:] if Path(path).name not in index_text]
    if failures:
        for path in failures:
            print(f"UNINDEXED_DOC: {path}")
        return 1

    print("Documentation lint passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
