import type { NextFunction, Request, RequestHandler, Response } from "express";

export class HttpError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(status: number, message: string, detail: unknown = null) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function parseNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

export function parseCsvList(value: unknown, fallback: number[]): number[] {
  if (Array.isArray(value)) {
    return value.map((item) => parseNumber(item, Number.NaN)).filter((item) => Number.isFinite(item));
  }
  if (typeof value === "string" && value.trim() !== "") {
    return value
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item));
  }
  return fallback;
}

export function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, `Missing or invalid ${fieldName}`);
  }
  return value.trim();
}

export function requireFiniteNumber(value: unknown, fieldName: string): number {
  const parsed = parseNumber(value, Number.NaN);
  if (!Number.isFinite(parsed)) {
    throw new HttpError(400, `Missing or invalid ${fieldName}`);
  }
  return parsed;
}
