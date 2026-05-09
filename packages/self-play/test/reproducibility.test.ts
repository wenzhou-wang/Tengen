import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { playMatch } from "../src/index.ts";

const NOW = () => new Date("2026-05-08T00:00:00.000Z");

describe("M4 acceptance: reproducibility", () => {
  it("identical (bot version, seed, size) produces identical records", async () => {
    const a = await playMatch({
      boardSize: 9,
      black: "random-v1",
      white: "heuristic-v1",
      seed: 12345,
      now: NOW,
    });
    const b = await playMatch({
      boardSize: 9,
      black: "random-v1",
      white: "heuristic-v1",
      seed: 12345,
      now: NOW,
    });

    assert.equal(a.record.recordId, b.record.recordId);
    assert.equal(a.record.moves.length, b.record.moves.length);
    assert.deepEqual(a.record.moves, b.record.moves);
    assert.equal(a.record.result, b.record.result);
    assert.equal(a.record.finalBoard, b.record.finalBoard);
    assert.equal(a.sgf, b.sgf);
  });

  it("different seeds diverge", async () => {
    const a = await playMatch({
      boardSize: 9,
      black: "random-v1",
      white: "random-v1",
      seed: 1,
      now: NOW,
    });
    const b = await playMatch({
      boardSize: 9,
      black: "random-v1",
      white: "random-v1",
      seed: 2,
      now: NOW,
    });
    // They should differ somewhere — either move list or final board.
    assert.notDeepEqual(a.record.moves, b.record.moves);
  });

  it("recordId differs when bot identity differs", async () => {
    const sameSeed = 99;
    const rr = await playMatch({
      boardSize: 9,
      black: "random-v1",
      white: "random-v1",
      seed: sameSeed,
      now: NOW,
    });
    const rh = await playMatch({
      boardSize: 9,
      black: "random-v1",
      white: "heuristic-v1",
      seed: sameSeed,
      now: NOW,
    });
    assert.notEqual(rr.record.recordId, rh.record.recordId);
  });
});
