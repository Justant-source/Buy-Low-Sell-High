import { runCliJson } from "./python.js";
import type { DataStatusPayload } from "./types.js";

export async function getDataStatus(csvPath: string, symbol: string): Promise<DataStatusPayload> {
  return runCliJson<DataStatusPayload>(["data", "status", "--csv", csvPath, "--symbol", symbol]);
}
