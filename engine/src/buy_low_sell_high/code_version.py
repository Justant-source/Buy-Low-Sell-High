from __future__ import annotations

from functools import lru_cache
from hashlib import sha256
from pathlib import Path
import subprocess

RESEARCH_CODE_PATHS = (
    "engine",
    "dashboard",
    "configs",
    "Makefile",
    "pyproject.toml",
)


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _run_git_command(*args: str) -> str:
    completed = subprocess.run(
        ["git", *args],
        cwd=_repo_root(),
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout.strip()


@lru_cache(maxsize=1)
def current_code_commit() -> str:
    repo_root = _repo_root()
    if not (repo_root / ".git").exists():
        return "workspace"
    try:
        head = _run_git_command("rev-parse", "HEAD")
        dirty_status = _run_git_command(
            "status",
            "--porcelain",
            "--untracked-files=all",
            "--",
            *RESEARCH_CODE_PATHS,
        )
        if not dirty_status:
            return head
        diff = _run_git_command("diff", "--binary", "HEAD", "--", *RESEARCH_CODE_PATHS)
        dirty_hash = sha256(f"{dirty_status}\n{diff}".encode("utf-8")).hexdigest()[:12]
        return f"{head}-dirty-{dirty_hash}"
    except (FileNotFoundError, subprocess.CalledProcessError):
        return "workspace"
