import { spawn } from "node:child_process";

import { engineSrcRoot, repoRoot } from "./paths.js";

export class CliInvocationError extends Error {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;

  constructor(message: string, exitCode: number | null, stdout: string, stderr: string) {
    super(message);
    this.exitCode = exitCode;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

function cliEnv(): NodeJS.ProcessEnv {
  const pythonPath = process.env.PYTHONPATH ? `${engineSrcRoot}:${process.env.PYTHONPATH}` : engineSrcRoot;
  return {
    ...process.env,
    PYTHONPATH: pythonPath,
  };
}

function invokeCli(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", ["-m", "buy_low_sell_high.cli", ...args], {
      cwd: repoRoot,
      env: cliEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      reject(new CliInvocationError(error.message, null, stdout, stderr));
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new CliInvocationError(
            `CLI invocation failed with exit code ${code ?? "unknown"}`,
            code,
            stdout,
            stderr,
          ),
        );
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

export async function runCliJson<T>(args: string[]): Promise<T> {
  const result = await invokeCli(args);
  try {
    return JSON.parse(result.stdout) as T;
  } catch (error) {
    throw new CliInvocationError(
      `CLI returned invalid JSON: ${(error as Error).message}`,
      0,
      result.stdout,
      result.stderr,
    );
  }
}
