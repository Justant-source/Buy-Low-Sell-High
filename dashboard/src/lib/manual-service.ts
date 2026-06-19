import { promises as fs } from "node:fs";
import path from "node:path";

import { HttpError } from "./http.js";
import { defaultCsvPath, runtimeRoot } from "./paths.js";
import { defaultProfileId, getProfileDefinition } from "./profiles.js";
import { runCliJson } from "./python.js";
import type { ManualLedgerPayload, ManualRecommendationPayload } from "./types.js";

function ledgerPath(profileId: string): string {
  return path.join(runtimeRoot, `manual-ledger-${profileId}.json`);
}

async function ensureLedger(profileId: string, initialCapital: number): Promise<string> {
  const profile = getProfileDefinition(profileId);
  if (!profile) {
    throw new HttpError(404, `Unknown profileId: ${profileId}`);
  }
  const targetPath = ledgerPath(profileId);
  try {
    await fs.access(targetPath);
    return targetPath;
  } catch {
    await runCliJson<ManualLedgerPayload>([
      "manual",
      "ledger",
      "init",
      "--ledger-path",
      targetPath,
      "--account-id",
      profileId,
      "--thread-count",
      String(profile.threadCount),
      "--initial-capital",
      String(initialCapital),
    ]);
    return targetPath;
  }
}

export async function getManualLedger(
  profileId = defaultProfileId,
  initialCapital = 10000,
): Promise<{ profileId: string; ledgerPath: string; ledger: ManualLedgerPayload }> {
  const targetPath = await ensureLedger(profileId, initialCapital);
  const ledger = await runCliJson<ManualLedgerPayload>([
    "manual",
    "ledger",
    "show",
    "--ledger-path",
    targetPath,
  ]);
  return { profileId, ledgerPath: targetPath, ledger };
}

export async function getTodayRecommendations(
  profileId = defaultProfileId,
  csvPath = defaultCsvPath,
  initialCapital = 10000,
): Promise<{ profileId: string; ledgerPath: string; recommendations: ManualRecommendationPayload[] }> {
  const profile = getProfileDefinition(profileId);
  if (!profile) {
    throw new HttpError(404, `Unknown profileId: ${profileId}`);
  }
  const targetPath = await ensureLedger(profileId, initialCapital);
  const recommendations = await runCliJson<ManualRecommendationPayload[]>([
    "manual",
    "today",
    "--profile",
    profile.profilePath,
    "--csv",
    csvPath,
    "--symbol",
    profile.symbol,
    "--initial-capital",
    String(initialCapital),
    "--ledger-path",
    targetPath,
  ]);
  return { profileId, ledgerPath: targetPath, recommendations };
}

export interface FillInput {
  profileId: string;
  threadId: number;
  side: string;
  quantity: string;
  price: string;
  fee?: string;
  filledAt?: string;
  initialCapital?: number;
}

export async function recordManualFill(input: FillInput): Promise<{
  profileId: string;
  ledgerPath: string;
  fill: unknown;
  ledger: ManualLedgerPayload;
}> {
  const profile = getProfileDefinition(input.profileId);
  if (!profile) {
    throw new HttpError(404, `Unknown profileId: ${input.profileId}`);
  }
  const targetPath = await ensureLedger(input.profileId, input.initialCapital ?? 10000);
  const args = [
    "manual",
    "ledger",
    "fill",
    "--ledger-path",
    targetPath,
    "--thread-id",
    String(input.threadId),
    "--side",
    input.side.toUpperCase(),
    "--quantity",
    input.quantity,
    "--price",
    input.price,
    "--fee",
    input.fee ?? "0",
  ];
  if (input.filledAt) {
    args.push("--filled-at", input.filledAt);
  }
  const payload = await runCliJson<{ fill: unknown; ledger: ManualLedgerPayload }>(args);
  return { profileId: input.profileId, ledgerPath: targetPath, fill: payload.fill, ledger: payload.ledger };
}

export async function reverseManualFill(
  profileId: string,
  fillId: string,
  initialCapital = 10000,
): Promise<{ profileId: string; ledgerPath: string; fill: unknown; ledger: ManualLedgerPayload }> {
  const profile = getProfileDefinition(profileId);
  if (!profile) {
    throw new HttpError(404, `Unknown profileId: ${profileId}`);
  }
  const targetPath = await ensureLedger(profileId, initialCapital);
  const payload = await runCliJson<{ fill: unknown; ledger: ManualLedgerPayload }>([
    "manual",
    "ledger",
    "reverse",
    "--ledger-path",
    targetPath,
    "--fill-id",
    fillId,
  ]);
  return { profileId, ledgerPath: targetPath, fill: payload.fill, ledger: payload.ledger };
}
