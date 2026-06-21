import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

import { repoRoot } from "./paths.js";

const RESEARCH_CODE_PATHS = [
  "engine",
  "dashboard",
  "configs",
  "Makefile",
  "pyproject.toml",
] as const;

let cachedCodeCommit: string | null = null;

function runGitCommand(args: string[]): string {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

export function currentCodeCommit(): string {
  if (cachedCodeCommit) {
    return cachedCodeCommit;
  }
  try {
    const head = runGitCommand(["rev-parse", "HEAD"]);
    const dirtyStatus = runGitCommand([
      "status",
      "--porcelain",
      "--untracked-files=all",
      "--",
      ...RESEARCH_CODE_PATHS,
    ]);
    if (!dirtyStatus) {
      cachedCodeCommit = head;
      return cachedCodeCommit;
    }
    const diff = runGitCommand(["diff", "--binary", "HEAD", "--", ...RESEARCH_CODE_PATHS]);
    const dirtyHash = createHash("sha256").update(`${dirtyStatus}\n${diff}`).digest("hex").slice(0, 12);
    cachedCodeCommit = `${head}-dirty-${dirtyHash}`;
    return cachedCodeCommit;
  } catch {
    cachedCodeCommit = "workspace";
    return cachedCodeCommit;
  }
}

export function codeCommitMatchesCurrent(codeCommit: string | null | undefined): boolean {
  return Boolean(codeCommit) && codeCommit === currentCodeCommit();
}
