import { strict as assert } from "node:assert";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { GAME_CORE_VERSION } from "@tengen/game-core";

import { TRAINING_RECORD_SCHEMA_VERSION, replayRecord, runBatch } from "../src/index.ts";
import type { BatchManifest, TrainingRecord } from "../src/types.ts";

const NOW = () => new Date("2026-05-08T00:00:00.000Z");

let outDir = "";

beforeEach(async () => {
  outDir = await mkdtemp(join(tmpdir(), "tengen-selfplay-"));
});

afterEach(async () => {
  if (outDir) await rm(outDir, { recursive: true, force: true });
});

describe("runBatch", () => {
  it("writes one JSON + one SGF per match plus a manifest", async () => {
    const result = await runBatch({
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

    assert.equal(result.records.length, 4);
    const files = (await readdir(outDir)).sort();
    const jsonRecords = files.filter((f) => f.endsWith(".json") && f !== "manifest.json");
    const sgfFiles = files.filter((f) => f.endsWith(".sgf"));
    assert.equal(jsonRecords.length, 4);
    assert.equal(sgfFiles.length, 4);
    assert.ok(files.includes("manifest.json"));
  });

  it("manifest stamps rules version, bot versions, board sizes, and date", async () => {
    const result = await runBatch({
      outputDir: outDir,
      baseSeed: 7,
      boardSizes: [9],
      pairings: [{ black: "random-v1", white: "heuristic-v1" }],
      matchesPerCell: 1,
      now: NOW,
    });

    const manifest = JSON.parse(await readFile(result.manifestPath, "utf8")) as BatchManifest;
    assert.equal(manifest.schemaVersion, TRAINING_RECORD_SCHEMA_VERSION);
    assert.equal(manifest.rulesPackageVersion, GAME_CORE_VERSION);
    assert.equal(manifest.generatedAt, NOW().toISOString());
    assert.deepEqual(manifest.boardSizes, [9]);
    assert.equal(manifest.matchCount, 1);
    const ids = manifest.bots.map((b) => b.id).sort();
    assert.deepEqual(ids, ["heuristic-v1", "random-v1"]);
    assert.equal(manifest.records.length, 1);
  });

  it("re-running with the same baseSeed produces byte-identical records", async () => {
    const a = await runBatch({
      outputDir: outDir,
      baseSeed: 99,
      boardSizes: [9],
      pairings: [{ black: "random-v1", white: "random-v1" }],
      matchesPerCell: 2,
      now: NOW,
    });

    const otherDir = await mkdtemp(join(tmpdir(), "tengen-selfplay-"));
    try {
      const b = await runBatch({
        outputDir: otherDir,
        baseSeed: 99,
        boardSizes: [9],
        pairings: [{ black: "random-v1", white: "random-v1" }],
        matchesPerCell: 2,
        now: NOW,
      });

      assert.equal(a.records.length, b.records.length);
      for (let i = 0; i < a.records.length; i += 1) {
        assert.equal(a.records[i].recordId, b.records[i].recordId);
        assert.deepEqual(a.records[i].moves, b.records[i].moves);
        assert.equal(a.records[i].finalBoard, b.records[i].finalBoard);
        assert.equal(a.records[i].result, b.records[i].result);
      }
    } finally {
      await rm(otherDir, { recursive: true, force: true });
    }
  });

  it("every record written by runBatch replays cleanly", async () => {
    const result = await runBatch({
      outputDir: outDir,
      baseSeed: 5,
      boardSizes: [9],
      pairings: [
        { black: "random-v1", white: "random-v1" },
        { black: "heuristic-v1", white: "random-v1" },
      ],
      matchesPerCell: 1,
      now: NOW,
    });

    for (const file of result.manifest.records) {
      const raw = await readFile(join(outDir, file), "utf8");
      const record = JSON.parse(raw) as TrainingRecord;
      const replay = replayRecord(record);
      assert.ok(replay.ok, `${file}: ${replay.ok ? "" : replay.error}`);
    }
  });

  it("rejects empty pairings / sizes / matchesPerCell", async () => {
    await assert.rejects(
      runBatch({
        outputDir: outDir,
        baseSeed: 1,
        boardSizes: [9],
        pairings: [],
        matchesPerCell: 1,
      }),
    );
    await assert.rejects(
      runBatch({
        outputDir: outDir,
        baseSeed: 1,
        boardSizes: [],
        pairings: [{ black: "random-v1", white: "random-v1" }],
        matchesPerCell: 1,
      }),
    );
    await assert.rejects(
      runBatch({
        outputDir: outDir,
        baseSeed: 1,
        boardSizes: [9],
        pairings: [{ black: "random-v1", white: "random-v1" }],
        matchesPerCell: 0,
      }),
    );
  });
});
