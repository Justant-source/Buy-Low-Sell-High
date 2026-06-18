from __future__ import annotations

from pathlib import Path
import sys


SCAN_DIRS = ["engine", "dashboard", "db", "scripts", "configs", ".github"]
SCAN_SUFFIXES = {".py", ".ts", ".tsx", ".js", ".json", ".yml", ".yaml", ".md"}
FORBIDDEN_PATTERNS = {
    "redis": "Redis is outside the product boundary",
    "ioredis": "Redis clients are forbidden",
    "bybit": "Bybit integration is forbidden",
    "telegram": "Telegram trading commands are forbidden",
    "submit_order": "Broker order submission is forbidden",
    "place_order": "Broker order submission is forbidden",
    "create_order": "Broker order submission is forbidden",
    "order:request": "Order execution message channels are forbidden",
}
ALLOWLIST = {
    "scripts/verify_no_autotrading.py": set(FORBIDDEN_PATTERNS.keys()),
}
REQUIRED_SERVICES = {"postgres", "engine-worker", "engine-cli", "dashboard"}


def _allowed(relative_path: str, pattern: str) -> bool:
    return pattern in ALLOWLIST.get(relative_path, set())


def _scan_source(root: Path) -> list[str]:
    violations: list[str] = []
    for scan_dir in SCAN_DIRS:
        base = root / scan_dir
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if not path.is_file() or path.suffix not in SCAN_SUFFIXES:
                continue
            relative_path = str(path.relative_to(root))
            text = path.read_text(encoding="utf-8")
            lowered = text.lower()
            for pattern, reason in FORBIDDEN_PATTERNS.items():
                if pattern in lowered and not _allowed(relative_path, pattern):
                    violations.append(f"{relative_path}: {reason} [{pattern}]")
    return violations


def _validate_compose(root: Path) -> list[str]:
    compose_path = root / "docker-compose.yml"
    if not compose_path.exists():
        return ["docker-compose.yml: missing"]

    lines = compose_path.read_text(encoding="utf-8").splitlines()
    services: set[str] = set()
    in_services = False
    for line in lines:
        if line.strip() == "services:":
            in_services = True
            continue
        if not in_services:
            continue
        if line.startswith("  ") and not line.startswith("    ") and line.rstrip().endswith(":"):
            services.add(line.strip().rstrip(":"))
        if in_services and line and not line.startswith(" ") and line.strip() != "services:":
            break

    if services != REQUIRED_SERVICES:
        return [
            "docker-compose.yml: expected only services "
            + ", ".join(sorted(REQUIRED_SERVICES))
            + f" but found {', '.join(sorted(services))}"
        ]
    return []


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    violations = _scan_source(root)
    violations.extend(_validate_compose(root))
    if violations:
        for violation in violations:
            print(f"VIOLATION: {violation}")
        return 1
    print("No autotrading or Redis violations found")
    return 0


if __name__ == "__main__":
    sys.exit(main())
