import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { runBatch, validateDataset } from "../src/index.ts";
import type { TrainingRecord } from "../src/types.ts";

const NOW = () => new Date("2026-05-08T00:00:00.000Z");

let outDir = "";

beforeEach(async () => {
  outDir = await mkdtemp(join(tmpdir(), "tengen-validate-"));
});

afterEach(async () => {
  if (outDir) await rm(outDir, { recursive: true, force: true });
});

async function loadFirstRecord(): Promise<{ filename: string; record: TrainingRecord }> {
  const result = await runBatch({
    outputDir: outDir,
    baseSeed: 1,
    boardSizes: [9],
    pairings: [{ black: "random-v1", white: "random-v1" }],
    matchesPerCell: 1,
    now: NOW,
  });
  const filename = result.manifest.records[0];
  const record = JSON.parse(await readFile(join(outDir, filename), "utf8")) as TrainingRecord;
  return { filename, record };
}

describe("validateDataset", () => {
  it("reports a clean batch as all-ok", async () => {
    await runBatch({
      outputDir: outDir,
      baseSeed: 1,
      boardSizes: [9],
      pairings: [
        { black: "random-v1", white: "random-v1" },
        { black: "random-v1", white: "heuristic-v1" },
      ],
      matchesPerCell: 2,
      now: NOW,
    });

    const report = await validateDataset(outDir);
    assert.equal(report.failed, 0, `unexpected failures: ${JSON.stringify(report.issues)}`);
    assert.equal(report.ok, 4);
    assert.ok(report.manifest);
    assert.equal(report.manifest?.matchCount, 4);
    assert.equal(report.recordIds.length, 4);
  });

  it("flags an illegal-replay record", async () => {
    const { filename, record } = await loadFirstRecord();
    // Tamper with a play move so replay fails.
    const playIdx = record.moves.findIndex((m) => m.type === "play");
    assert.ok(playIdx >= 0);
    record.moves[playIdx] = {
      ...record.moves[playIdx],
      color: record.moves[playIdx].color === "B" ? "W" : "B",
    };
    await writeFile(join(outDir, filename), JSON.stringify(record, null, 2), "utf8");

    const report = await validateDataset(outDir);
    assert.equal(report.failed, 1);
    assert.ok(report.issues.some((i) => i.kind === "illegal-replay"));
  });

  it("flags duplicate record ids", async () => {
    const { filename, record } = await loadFirstRecord();
    // Write a copy under a different filename with the same recordId.
    await writeFile(join(outDir, "duplicate.json"), JSON.stringify(record, null, 2), "utf8");
    const report = await validateDataset(outDir);
    assert.ok(report.issues.some((i) => i.kind === "duplicate-record-id"));
    assert.ok(report.failed >= 1);
    // Sanity: original filename is still loadable.
    const raw = await readFile(join(outDir, filename), "utf8");
    assert.ok(raw.length > 0);
  });

  it("flags corrupted JSON", async () => {
    await loadFirstRecord();
    await writeFile(join(outDir, "broken.json"), "{ this is not valid json", "utf8");
    const report = await validateDataset(outDir);
    assert.ok(report.issues.some((i) => i.kind === "invalid-json"));
    assert.ok(report.failed >= 1);
  });

  it("flags shape errors (missing fields)", async () => {
    const { filename, record } = await loadFirstRecord();
    const broken: Partial<TrainingRecord> = { ...record };
    delete broken.recordId;
    await writeFile(join(outDir, filename), JSON.stringify(broken, null, 2), "utf8");
    const report = await validateDataset(outDir);
    assert.ok(report.issues.some((i) => i.kind === "shape"));
    assert.ok(report.failed >= 1);
  });

  it("flags non-terminal records under requireTerminal", async () => {
    // Build a non-terminal record by capping moves brutally.
    await runBatch({
      outputDir: outDir,
      baseSeed: 1,
      boardSizes: [9],
      pairings: [{ black: "random-v1", white: "random-v1" }],
      matchesPerCell: 1,
      maxMoves: 2,
      now: NOW,
    });
    const report = await validateDataset(outDir, { requireTerminal: true });
    assert.ok(report.issues.some((i) => i.kind === "non-terminal"));
    assert.ok(report.failed >= 1);
  });
});
