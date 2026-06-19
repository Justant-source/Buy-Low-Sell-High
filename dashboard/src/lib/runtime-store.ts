import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { jobsRoot, runsRoot, runtimeRoot } from "./paths.js";
import type { DashboardJobRecord, PersistedRunArtifact } from "./types.js";

async function ensureDir(target: string): Promise<void> {
  await fs.mkdir(target, { recursive: true });
}

async function ensureLayout(): Promise<void> {
  await ensureDir(runtimeRoot);
  await ensureDir(jobsRoot);
  await ensureDir(runsRoot);
}

async function writeJson(filePath: string, payload: unknown): Promise<void> {
  await ensureLayout();
  const tempPath = `${filePath}.${randomUUID()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  await fs.rename(tempPath, filePath);
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function listJson<T>(dirPath: string): Promise<T[]> {
  await ensureLayout();
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const loaded = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => readJson<T>(path.join(dirPath, entry.name))),
  );
  const results: T[] = [];
  for (const item of loaded) {
    if (item !== null) {
      results.push(item);
    }
  }
  return results;
}

function jobPath(jobId: string): string {
  return path.join(jobsRoot, `${jobId}.json`);
}

function runPath(runId: string): string {
  return path.join(runsRoot, `${runId}.json`);
}

export function newJobId(): string {
  return randomUUID();
}

export async function saveJob(job: DashboardJobRecord): Promise<void> {
  await writeJson(jobPath(job.jobId), job);
}

export async function loadJob(jobId: string): Promise<DashboardJobRecord | null> {
  return readJson<DashboardJobRecord>(jobPath(jobId));
}

export async function listJobs(limit = 20): Promise<DashboardJobRecord[]> {
  const jobs = await listJson<DashboardJobRecord>(jobsRoot);
  return jobs
    .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt))
    .slice(0, limit);
}

export async function saveRunArtifact(artifact: PersistedRunArtifact): Promise<void> {
  await writeJson(runPath(artifact.runId), artifact);
}

export async function loadRunArtifact(runId: string): Promise<PersistedRunArtifact | null> {
  return readJson<PersistedRunArtifact>(runPath(runId));
}

export async function listRunArtifacts(limit = 10): Promise<PersistedRunArtifact[]> {
  const runs = await listJson<PersistedRunArtifact>(runsRoot);
  return runs
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
}
