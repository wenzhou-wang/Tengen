import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  BLACK,
  EMPTY,
  WHITE,
  createInitialState,
  getPublicState,
  passOnGame,
  playMoveOnGame,
} from "@tengen/game-core";

import {
  createBot,
  createHeuristicBot,
  createMulberry32,
  createRandomBot,
  listBotMetadata,
} from "../src/index.ts";

function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

describe("random bot", () => {
  it("returns a legal move on an empty board", async () => {
    const bot = createRandomBot({ rng: seededRng(1) });
    const game = createInitialState(9);
    const decision = await bot.getMove(getPublicState(game));
    assert.ok(decision && "x" in decision, "expected a coordinate move");
    if (decision && "x" in decision) {
      assert.ok(decision.x >= 0 && decision.x < 9);
      assert.ok(decision.y >= 0 && decision.y < 9);
      const next = playMoveOnGame(game, decision.x, decision.y);
      assert.ok(!("error" in next), "random move must be legal");
    }
  });

  it("passes when the game is over", async () => {
    const bot = createRandomBot({ rng: seededRng(1) });
    let game = createInitialState(9);
    game = passOnGame(game);
    game = passOnGame(game);
    const decision = await bot.getMove(getPublicState(game));
    assert.deepEqual(decision, { pass: true });
  });
});

describe("heuristic bot", () => {
  it("captures a stone in atari when offered the chance", async () => {
    const bot = createHeuristicBot({ jitter: 0 });
    let game = createInitialState(9);
    // Build a position with a single white stone in atari at (4,4).
    // Surround on three sides by black; the legal capturing move is (5,4).
    game = playMoveOnGame(game, 4, 4) as typeof game; // B 4,4? — wait we need it to be a *white* stone in atari.
    // Restart and build by alternating moves so the rules engine accepts them.
    game = createInitialState(9);
    game = playMoveOnGame(game, 3, 4) as typeof game; // B
    game = playMoveOnGame(game, 4, 4) as typeof game; // W
    game = playMoveOnGame(game, 4, 3) as typeof game; // B
    game = playMoveOnGame(game, 0, 0) as typeof game; // W (filler far away)
    game = playMoveOnGame(game, 4, 5) as typeof game; // B; white at (4,4) now has 1 liberty at (5,4).
    game = playMoveOnGame(game, 0, 1) as typeof game; // W (filler)
    assert.equal(game.board[4][4], WHITE, "setup: white stone at 4,4");
    assert.equal(game.current, BLACK, "setup: black to play and can capture");

    const decision = await bot.getMove(getPublicState(game));
    assert.ok(decision && "x" in decision, "expected a coordinate move");
    if (decision && "x" in decision) {
      assert.equal(decision.x, 5);
      assert.equal(decision.y, 4);
      const next = playMoveOnGame(game, decision.x, decision.y);
      assert.ok(!("error" in next), "capture move must be legal");
      if (!("error" in next)) {
        assert.equal(next.board[4][4], EMPTY, "captured stone removed from board");
        assert.equal(next.captures[BLACK], 1);
      }
    }
  });

  it("avoids putting itself into atari when a safer move exists", async () => {
    const bot = createHeuristicBot({ jitter: 0 });
    // 9x9: black plays around an empty corner so that (0,0) would be self-atari.
    // Sequence carefully constructed; verify the bot does not pick (0,0).
    let game = createInitialState(9);
    // Build: Black at (1,0) and (0,1), so (0,0) is a corner with only 0 own-liberties
    // available except via (0,0) itself, which would be a 1-liberty stone.
    game = playMoveOnGame(game, 1, 0) as typeof game; // B
    game = playMoveOnGame(game, 5, 5) as typeof game; // W far away
    game = playMoveOnGame(game, 0, 1) as typeof game; // B
    game = playMoveOnGame(game, 5, 6) as typeof game; // W
    // Black to move now. (0,0) is legal but creates a 1-liberty stone (atari).
    const decision = await bot.getMove(getPublicState(game));
    assert.ok(decision && "x" in decision);
    if (decision && "x" in decision) {
      assert.ok(
        !(decision.x === 0 && decision.y === 0),
        "bot should not voluntarily play self-atari at (0,0)",
      );
    }
  });

  it("passes when the game is already over", async () => {
    const bot = createHeuristicBot({ jitter: 0 });
    let game = createInitialState(9);
    game = passOnGame(game);
    game = passOnGame(game);
    const decision = await bot.getMove(getPublicState(game));
    assert.deepEqual(decision, { pass: true });
  });
});

describe("registry", () => {
  it("lists random and heuristic bots with versions", () => {
    const list = listBotMetadata();
    assert.equal(list.length, 2);
    const ids = list.map((b) => b.id).sort();
    assert.deepEqual(ids, ["heuristic-v1", "random-v1"]);
    for (const meta of list) {
      assert.ok(meta.version.length > 0);
      assert.ok(meta.label.length > 0);
    }
  });

  it("createBot with the same seed produces the same move sequence", async () => {
    const playN = async (seed: number, n: number) => {
      const bot = createBot("random-v1", { seed });
      let game = createInitialState(9);
      const moves: Array<{ x: number; y: number } | "pass"> = [];
      for (let i = 0; i < n; i += 1) {
        const decision = await bot.getMove(getPublicState(game));
        if (!decision || ("pass" in decision && decision.pass)) {
          moves.push("pass");
          game = passOnGame(game);
          continue;
        }
        if ("x" in decision) {
          const next = playMoveOnGame(game, decision.x, decision.y);
          if ("error" in next) {
            moves.push("pass");
            game = passOnGame(game);
          } else {
            moves.push({ x: decision.x, y: decision.y });
            game = next;
          }
        }
      }
      return moves;
    };

    const a = await playN(1234, 8);
    const b = await playN(1234, 8);
    const c = await playN(5678, 8);
    assert.deepEqual(a, b, "same seed must yield identical move sequence");
    assert.notDeepEqual(a, c, "different seeds should diverge");
  });
});

describe("rng", () => {
  it("mulberry32 is deterministic for a given seed", () => {
    const a = createMulberry32(42);
    const b = createMulberry32(42);
    for (let i = 0; i < 16; i += 1) {
      assert.equal(a(), b());
    }
  });
});
