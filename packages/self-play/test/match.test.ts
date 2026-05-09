import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { GAME_CORE_VERSION } from "@tengen/game-core";

import { TRAINING_RECORD_SCHEMA_VERSION, derivePlayerSeed, playMatch } from "../src/index.ts";

const FIXED_DATE = new Date("2026-05-08T00:00:00.000Z");
const fixedNow = () => FIXED_DATE;

describe("playMatch", () => {
  it("produces a complete training record for a random-vs-random 9x9 game", async () => {
    const { record, sgf } = await playMatch({
      boardSize: 9,
      black: "random-v1",
      white: "random-v1",
      seed: 42,
      now: fixedNow,
    });

    assert.equal(record.schemaVersion, TRAINING_RECORD_SCHEMA_VERSION);
    assert.equal(record.boardSize, 9);
    assert.equal(record.seed, 42);
    assert.equal(record.rulesPackageVersion, GAME_CORE_VERSION);
    assert.equal(record.generatedAt, FIXED_DATE.toISOString());
    assert.equal(record.players.B.id, "random-v1");
    assert.equal(record.players.W.id, "random-v1");
    assert.equal(record.players.B.seed, derivePlayerSeed(42, "B"));
    assert.equal(record.players.W.seed, derivePlayerSeed(42, "W"));
    assert.ok(record.moves.length > 0, "expected some moves");
    if (record.terminal) {
      assert.ok(/^B\+|^W\+/.test(record.result), `result should be B+/W+, got ${record.result}`);
      assert.ok(sgf.includes(`RE[${record.result}]`));
    } else {
      assert.equal(record.result, "");
      assert.equal(record.endReason, "max-moves");
    }
    assert.ok(sgf.startsWith("(;GM[1]"), "SGF should start with the standard header");
    assert.ok(sgf.includes(`SZ[9]`));
  });

  it("derives different B and W seeds from the same master seed", () => {
    assert.notEqual(derivePlayerSeed(42, "B"), derivePlayerSeed(42, "W"));
    assert.equal(derivePlayerSeed(42, "B"), derivePlayerSeed(42, "B"));
  });

  it("respects maxMoves and reports max-moves truncation", async () => {
    const { record } = await playMatch({
      boardSize: 9,
      black: "random-v1",
      white: "random-v1",
      seed: 1,
      maxMoves: 3,
      now: fixedNow,
    });
    assert.equal(record.moves.length, 3);
    assert.equal(record.terminal, false);
    assert.equal(record.endReason, "max-moves");
  });

  it("includes capture counts on play moves", async () => {
    const { record } = await playMatch({
      boardSize: 9,
      black: "heuristic-v1",
      white: "heuristic-v1",
      seed: 7,
      now: fixedNow,
    });
    for (const move of record.moves) {
      if (move.type === "play") {
        assert.ok(typeof move.captures === "number" && move.captures >= 0);
        assert.ok(typeof move.coord === "string" && move.coord.length >= 2);
      }
    }
  });
});
