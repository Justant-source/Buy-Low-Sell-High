import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { __testing } from "../dist/lib/research-store.js";

test("prepareSqliteSeedFile rotates oversize sqlite files before load", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "blsh-research-store-"));
  const sqlitePath = path.join(tempDir, "runtime.sqlite");
  const oversizedBytes = Buffer.alloc(16, 7);

  const originalStat = __testing.SQLITE_MAX_LOAD_BYTES;
  __testing.SQLITE_MAX_LOAD_BYTES = 8;
  try {
    await writeFile(sqlitePath, oversizedBytes);
    const seed = await __testing.prepareSqliteSeedFile(sqlitePath);
    assert.equal(seed, undefined);
    const names = await readdir(tempDir);
    assert.equal(names.includes("runtime.sqlite"), false);
    const rotatedName = names.find((name) => name.startsWith("runtime.sqlite.oversize-"));
    assert.ok(rotatedName);
    const rotatedBytes = await readFile(path.join(tempDir, rotatedName));
    assert.deepEqual(rotatedBytes, oversizedBytes);
  } finally {
    __testing.SQLITE_MAX_LOAD_BYTES = originalStat;
  }
});
