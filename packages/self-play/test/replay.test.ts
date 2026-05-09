import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { iterateTrainingExamples, playMatch, replayRecord } from "../src/index.ts";

const NOW = () => new Date("2026-05-08T00:00:00.000Z");

describe("M4 acceptance: replay", () => {
  it("every random-vs-random record replays without illegal states", async () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { record } = await playMatch({
        boardSize: 9,
        black: "random-v1",
        white: "random-v1",
        seed,
        now: NOW,
      });
      const result = replayRecord(record);
      assert.ok(result.ok, `seed ${seed}: ${result.ok ? "" : result.error}`);
    }
  });

  it("heuristic-vs-heuristic replays match recorded result and final board", async () => {
    const { record } = await playMatch({
      boardSize: 9,
      black: "heuristic-v1",
      white: "heuristic-v1",
      seed: 17,
      now: NOW,
    });
    const result = replayRecord(record);
    assert.ok(result.ok, `replay should succeed: ${result.ok ? "" : result.error}`);
    if (result.ok) {
      assert.equal(result.game.result, record.result);
      assert.equal(result.game.gameOver, record.terminal);
    }
  });

  it("detects a tampered move", async () => {
    const { record } = await playMatch({
      boardSize: 9,
      black: "random-v1",
      white: "random-v1",
      seed: 33,
      now: NOW,
    });
    // Find a play move and corrupt its color (swap B<->W) to force replay failure.
    const tampered = structuredClone(record);
    const playIdx = tampered.moves.findIndex((m) => m.type === "play");
    assert.ok(playIdx >= 0);
    tampered.moves[playIdx] = {
      ...tampered.moves[playIdx],
      color: tampered.moves[playIdx].color === "B" ? "W" : "B",
    };
    const result = replayRecord(tampered);
    assert.equal(result.ok, false);
  });

  it("detects a finalBoard that does not match the played moves", async () => {
    const { record } = await playMatch({
      boardSize: 9,
      black: "random-v1",
      white: "random-v1",
      seed: 44,
      now: NOW,
    });
    const tampered = { ...record, finalBoard: "0".repeat(record.boardSize * record.boardSize) };
    const result = replayRecord(tampered);
    assert.equal(result.ok, false);
  });

  it("iterateTrainingExamples yields one example per move with correct value sign", async () => {
    const { record } = await playMatch({
      boardSize: 9,
      black: "random-v1",
      white: "heuristic-v1",
      seed: 88,
      now: NOW,
    });
    const examples = Array.from(iterateTrainingExamples(record));
    assert.equal(examples.length, record.moves.length);
    if (record.winner) {
      // Every example's value must be ±1 since we have a winner.
      for (const ex of examples) {
        const expected: -1 | 1 = ex.move.color === record.winner ? 1 : -1;
        assert.equal(ex.value, expected);
      }
    }
  });
});
