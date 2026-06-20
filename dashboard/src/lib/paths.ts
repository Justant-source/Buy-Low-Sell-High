import path from "node:path";
import { fileURLToPath } from "node:url";

const thisFile = fileURLToPath(import.meta.url);
const libRoot = path.dirname(thisFile);

export const repoRoot = path.resolve(libRoot, "../../..");
export const dashboardRoot = path.join(repoRoot, "dashboard");
export const publicRoot = path.join(dashboardRoot, "public");
export const runtimeRoot = path.join(repoRoot, "data", "runtime", "dashboard");
export const jobsRoot = path.join(runtimeRoot, "jobs");
export const runsRoot = path.join(runtimeRoot, "runs");
export const mentorMatrixRoot = path.join(runtimeRoot, "mentor-matrix");
export const officialMatrixRoot = path.join(runtimeRoot, "official-matrix");
export const configsRoot = path.join(repoRoot, "configs", "strategies");
export const engineSrcRoot = path.join(repoRoot, "engine", "src");

export function defaultCsvPathForSymbol(symbol: string): string {
  return path.join(repoRoot, "data", "raw", `${symbol.toLowerCase()}_daily_2011_present.csv`);
}
