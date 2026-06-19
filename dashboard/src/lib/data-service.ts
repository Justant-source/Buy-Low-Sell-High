import { defaultCsvPath } from "./paths.js";
import { runCliJson } from "./python.js";
import type { DataStatusPayload } from "./types.js";

export async function getDataStatus(csvPath = defaultCsvPath, symbol = "SOXL"): Promise<DataStatusPayload> {
  return runCliJson<DataStatusPayload>(["data", "status", "--csv", csvPath, "--symbol", symbol]);
}
