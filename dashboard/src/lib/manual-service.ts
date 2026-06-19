import { promises as fs } from "node:fs";
import path from "node:path";

import { HttpError } from "./http.js";
import { defaultCsvPath, runtimeRoot } from "./paths.js";
import { defaultProfileId, getProfileDefinition } from "./profiles.js";
import { runCliJson } from "./python.js";
import type { ManualComparisonRowPayload, ManualLedgerPayload, ManualRecommendationPayload } from "./types.js";

const RESTORE_CONFIRM_TOKEN = "RESTORE_MANUAL_LEDGER";

interface ManualLedgerBackupPayload {
  account_id: string;
  threads: Record<string, { cash: string; quantity: string; entry_price: string; entry_date: string | null }>;
  fills: Array<{
    fill_id: string;
    thread_id: number;
    side: string;
    quantity: string;
    price: string;
    fee: string;
    filled_at: string;
    reversed_by_fill_id: string | null;
  }>;
}

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

function toBackupPayload(ledger: ManualLedgerPayload): ManualLedgerBackupPayload {
  return {
    account_id: ledger.summary.account_id,
    threads: Object.fromEntries(
      ledger.threads.map((thread) => [
        String(thread.thread_id),
        {
          cash: thread.cash,
          quantity: thread.quantity,
          entry_price: thread.entry_price,
          entry_date: thread.entry_date,
        },
      ]),
    ),
    fills: ledger.fills.map((fill) => ({
      fill_id: fill.fill_id,
      thread_id: fill.thread_id,
      side: fill.side,
      quantity: fill.quantity,
      price: fill.price,
      fee: fill.fee,
      filled_at: fill.filled_at,
      reversed_by_fill_id: fill.reversed_by_fill_id,
    })),
  };
}

function fillsToCsv(ledger: ManualLedgerPayload): string {
  const header = ["fill_id", "thread_id", "side", "quantity", "price", "fee", "filled_at", "reversed_by_fill_id"];
  const rows = ledger.fills.map((fill) =>
    header
      .map((column) => {
        const value = fill[column as keyof (typeof ledger.fills)[number]] ?? "";
        return `"${String(value).replaceAll("\"", "\"\"")}"`;
      })
      .join(","),
  );
  return `${header.join(",")}\n${rows.join("\n")}\n`;
}

function parseRestorePayload(payload: unknown): ManualLedgerBackupPayload {
  let parsed: unknown;
  try {
    parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  } catch (error) {
    throw new HttpError(400, `Restore payload is not valid JSON: ${(error as Error).message}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new HttpError(400, "Restore payload must be a JSON object");
  }
  return parsed as ManualLedgerBackupPayload;
}

function recommendationExpectedSide(action: string): string | null {
  if (action === "BUY") {
    return "BUY";
  }
  if (action === "TAKE_PROFIT" || action === "TIME_STOP") {
    return "SELL";
  }
  return null;
}

function executionQuality(expectedSide: string, basisPrice: number, actualPrice: number): string {
  if (actualPrice === basisPrice) {
    return "MATCH";
  }
  if (expectedSide === "BUY") {
    return actualPrice < basisPrice ? "BETTER" : "WORSE";
  }
  return actualPrice > basisPrice ? "BETTER" : "WORSE";
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

export async function getManualThreads(
  profileId = defaultProfileId,
  initialCapital = 10000,
): Promise<{
  profileId: string;
  ledgerPath: string;
  summary: ManualLedgerPayload["summary"];
  threads: ManualLedgerPayload["threads"];
}> {
  const { ledgerPath, ledger } = await getManualLedger(profileId, initialCapital);
  return {
    profileId,
    ledgerPath,
    summary: ledger.summary,
    threads: ledger.threads,
  };
}

export async function getManualHistory(
  profileId = defaultProfileId,
  initialCapital = 10000,
): Promise<{
  profileId: string;
  ledgerPath: string;
  summary: ManualLedgerPayload["summary"];
  fills: ManualLedgerPayload["fills"];
}> {
  const { ledgerPath, ledger } = await getManualLedger(profileId, initialCapital);
  return {
    profileId,
    ledgerPath,
    summary: ledger.summary,
    fills: ledger.fills,
  };
}

export async function reconcileManualLedger(
  profileId = defaultProfileId,
  initialCapital = 10000,
): Promise<{
  profileId: string;
  ledgerPath: string;
  summary: ManualLedgerPayload["summary"];
  issues: string[];
}> {
  const { ledgerPath, ledger } = await getManualLedger(profileId, initialCapital);
  return {
    profileId,
    ledgerPath,
    summary: ledger.summary,
    issues: ledger.issues,
  };
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

export async function getManualComparison(
  profileId = defaultProfileId,
  csvPath = defaultCsvPath,
  initialCapital = 10000,
): Promise<{
  profileId: string;
  ledgerPath: string;
  rows: ManualComparisonRowPayload[];
}> {
  const [{ ledgerPath, ledger }, { recommendations }] = await Promise.all([
    getManualLedger(profileId, initialCapital),
    getTodayRecommendations(profileId, csvPath, initialCapital),
  ]);
  const rows = recommendations.map((recommendation) => {
    const expectedSide = recommendationExpectedSide(recommendation.action);
    if (!expectedSide) {
      return {
        thread_id: recommendation.thread_id,
        action: recommendation.action,
        expected_side: null,
        reason: recommendation.reason,
        basis_price: recommendation.basis_price,
        session_date: recommendation.session_date,
        status: "NO_FILL_EXPECTED",
        execution_quality: "N/A",
        fill_id: null,
        actual_price: null,
        actual_quantity: null,
        actual_filled_at: null,
        price_gap: null,
        price_gap_pct: null,
      };
    }
    const match = [...ledger.fills]
      .reverse()
      .find(
        (fill) =>
          fill.thread_id === recommendation.thread_id &&
          fill.side === expectedSide &&
          fill.reversed_by_fill_id === null &&
          fill.filled_at.slice(0, 10) >= recommendation.session_date,
      );
    if (!match) {
      return {
        thread_id: recommendation.thread_id,
        action: recommendation.action,
        expected_side: expectedSide,
        reason: recommendation.reason,
        basis_price: recommendation.basis_price,
        session_date: recommendation.session_date,
        status: "PENDING_FILL",
        execution_quality: "N/A",
        fill_id: null,
        actual_price: null,
        actual_quantity: null,
        actual_filled_at: null,
        price_gap: null,
        price_gap_pct: null,
      };
    }
    const basisPrice = Number(recommendation.basis_price);
    const actualPrice = Number(match.price);
    const priceGap = actualPrice - basisPrice;
    const priceGapPct = basisPrice === 0 ? null : (priceGap / basisPrice) * 100;
    return {
      thread_id: recommendation.thread_id,
      action: recommendation.action,
      expected_side: expectedSide,
      reason: recommendation.reason,
      basis_price: recommendation.basis_price,
      session_date: recommendation.session_date,
      status: "FILLED",
      execution_quality: executionQuality(expectedSide, basisPrice, actualPrice),
      fill_id: match.fill_id,
      actual_price: match.price,
      actual_quantity: match.quantity,
      actual_filled_at: match.filled_at,
      price_gap: priceGap.toFixed(4),
      price_gap_pct: priceGapPct === null ? null : priceGapPct.toFixed(4),
    };
  });
  return {
    profileId,
    ledgerPath,
    rows,
  };
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

export async function exportManualLedger(
  profileId = defaultProfileId,
  format = "json",
  initialCapital = 10000,
): Promise<{
  profileId: string;
  ledgerPath: string;
  filename: string;
  contentType: string;
  content: string;
}> {
  const { ledgerPath, ledger } = await getManualLedger(profileId, initialCapital);
  if (format === "json") {
    return {
      profileId,
      ledgerPath,
      filename: `manual-ledger-${profileId}.json`,
      contentType: "application/json; charset=utf-8",
      content: `${JSON.stringify(toBackupPayload(ledger), null, 2)}\n`,
    };
  }
  if (format === "csv") {
    return {
      profileId,
      ledgerPath,
      filename: `manual-ledger-${profileId}-fills.csv`,
      contentType: "text/csv; charset=utf-8",
      content: fillsToCsv(ledger),
    };
  }
  throw new HttpError(400, `Unsupported export format: ${format}`);
}

export async function restoreManualLedger(input: {
  profileId: string;
  payload: unknown;
  confirmToken: string;
  initialCapital?: number;
}): Promise<{
  profileId: string;
  ledgerPath: string;
  ledger: ManualLedgerPayload;
  backup: ManualLedgerBackupPayload;
}> {
  if (input.confirmToken !== RESTORE_CONFIRM_TOKEN) {
    throw new HttpError(400, "Invalid restore confirm token");
  }
  const profile = getProfileDefinition(input.profileId);
  if (!profile) {
    throw new HttpError(404, `Unknown profileId: ${input.profileId}`);
  }
  const backup = parseRestorePayload(input.payload);
  if (backup.account_id !== input.profileId) {
    throw new HttpError(400, `Restore payload account_id must match profileId: ${input.profileId}`);
  }
  if (Object.keys(backup.threads ?? {}).length !== profile.threadCount) {
    throw new HttpError(400, `Restore payload thread count must match profile thread count: ${profile.threadCount}`);
  }
  const targetPath = await ensureLedger(input.profileId, input.initialCapital ?? 10000);
  const serialized = JSON.stringify(backup, null, 2);
  const tempDir = await fs.mkdtemp(path.join(runtimeRoot, "restore-"));
  const sourcePath = path.join(tempDir, "manual-ledger-restore.json");
  try {
    await fs.writeFile(sourcePath, serialized, "utf-8");
    const payload = await runCliJson<{ ledger: ManualLedgerPayload; backup: ManualLedgerBackupPayload }>([
      "manual",
      "ledger",
      "restore",
      "--ledger-path",
      targetPath,
      "--source-path",
      sourcePath,
    ]);
    return {
      profileId: input.profileId,
      ledgerPath: targetPath,
      ledger: payload.ledger,
      backup: payload.backup,
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export { RESTORE_CONFIRM_TOKEN };
