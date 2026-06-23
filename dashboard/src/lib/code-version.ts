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

function runGitCommand(args: string[]): string {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

export function currentCodeCommit(): string {
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
      return head;
    }
    const diff = runGitCommand(["diff", "--binary", "HEAD", "--", ...RESEARCH_CODE_PATHS]);
    const dirtyHash = createHash("sha256").update(`${dirtyStatus}\n${diff}`).digest("hex").slice(0, 12);
    return `${head}-dirty-${dirtyHash}`;
  } catch {
    return "workspace";
  }
}

export function codeCommitMatchesCurrent(codeCommit: string | null | undefined): boolean {
  return Boolean(codeCommit) && codeCommit === currentCodeCommit();
}
