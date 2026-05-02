import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  BLACK,
  EMPTY,
  KOMI,
  WHITE,
  buildSgf,
  computeScore,
  createInitialState,
  evaluateMove,
  passOnGame,
  playMoveOnGame,
  resignOnGame,
  serializeBoard,
  toSnapshot,
  undoOnGame,
  type GameState,
} from "../src/index.ts";

function play(game: GameState, x: number, y: number): GameState {
  const next = playMoveOnGame(game, x, y);
  if ("error" in next) {
    throw new Error(`expected legal move at (${x},${y}): ${next.error}`);
  }
  return next;
}

describe("captures", () => {
  it("removes a single stone with no liberties", () => {
    let game = createInitialState(9);
    // Surround a single white stone at (1,1).
    game = play(game, 1, 0); // B
    game = play(game, 1, 1); // W
    game = play(game, 0, 1); // B
    game = play(game, 8, 8); // W elsewhere
    game = play(game, 2, 1); // B
    game = play(game, 7, 8); // W elsewhere
    game = play(game, 1, 2); // B captures white at (1,1)

    assert.equal(game.board[1][1], EMPTY, "captured stone should be removed");
    assert.equal(game.captures[BLACK], 1, "Black should record one capture");
    assert.equal(game.captures[WHITE], 0);
  });

  it("removes a multi-stone group surrounded together", () => {
    let game = createInitialState(9);
    // White builds a 1x2 group at (1,1)(2,1); Black surrounds.
    game = play(game, 1, 0); // B
    game = play(game, 1, 1); // W
    game = play(game, 2, 0); // B
    game = play(game, 2, 1); // W
    game = play(game, 0, 1); // B
    game = play(game, 8, 8); // W elsewhere
    game = play(game, 3, 1); // B
    game = play(game, 7, 8); // W elsewhere
    game = play(game, 1, 2); // B
    game = play(game, 6, 8); // W elsewhere
    game = play(game, 2, 2); // B captures both whites

    assert.equal(game.board[1][1], EMPTY);
    assert.equal(game.board[1][2], EMPTY);
    assert.equal(game.captures[BLACK], 2);
  });
});

describe("suicide", () => {
  it("rejects a move that would self-capture", () => {
    let game = createInitialState(9);
    // Surround empty (0,0) with three black stones; white plays (0,0) is suicide.
    game = play(game, 1, 0); // B
    game = play(game, 8, 8); // W elsewhere
    game = play(game, 0, 1); // B
    // Force white to be next to play at (0,0).
    const result = evaluateMove(game, 0, 0, WHITE);
    assert.equal(result.legal, false);
    if (!result.legal) {
      assert.match(result.reason, /suicide/i);
    }
  });

  it("allows a move that captures even if it would otherwise be suicide", () => {
    let game = createInitialState(9);
    // Build a position where placing fills the only liberty of an enemy group.
    // Position: white stone at (0,0) surrounded by blacks at (1,0),(0,1) — its
    // only liberty is the diagonal escape, but Go has no diagonals; so (0,0)
    // already has zero liberties only when (1,0) and (0,1) are both black.
    // We instead test: black captures white at (1,0) by playing (2,0) which
    // is NOT suicide because the captured stone frees a liberty.
    game = play(game, 0, 0); // B
    game = play(game, 1, 0); // W
    game = play(game, 1, 1); // B
    game = play(game, 8, 8); // W far
    const next = playMoveOnGame(game, 2, 0); // B captures W at (1,0)
    if ("error" in next) {
      throw new Error(`unexpected rejection: ${next.error}`);
    }
    assert.equal(next.board[0][1], EMPTY);
    assert.equal(next.captures[BLACK], 1);
  });
});

describe("positional superko", () => {
  it("rejects a board repetition", () => {
    // Classic ko shape on 9x9:
    //   . B W .
    //   B . B W
    //   . B W .
    // Black plays at the middle empty point in row 1 to capture white.
    // Then white wants to recapture immediately — same position; should be
    // blocked by superko.
    let game = createInitialState(9);
    game = play(game, 1, 0); // B (1,0)
    game = play(game, 2, 0); // W (2,0)
    game = play(game, 0, 1); // B (0,1)
    game = play(game, 3, 1); // W (3,1)
    game = play(game, 2, 1); // B (2,1)
    game = play(game, 2, 2); // W (2,2)
    game = play(game, 1, 2); // B (1,2)
    // White plays (1,1) to capture black at (2,1). Wait — is that a capture?
    // After white at (1,1): black group at (2,1) has neighbors (1,1)=W,
    // (3,1)=W, (2,0)=W, (2,2)=W → captured.
    game = play(game, 1, 1); // W captures B at (2,1)
    assert.equal(game.board[1][2], EMPTY);
    // Black tries to immediately recapture at (2,1) — recreates prior board.
    const result = evaluateMove(game, 2, 1, BLACK);
    assert.equal(result.legal, false);
    if (!result.legal) {
      assert.match(result.reason, /repeats/i);
    }
  });
});

describe("pass and resign", () => {
  it("two consecutive passes end the game and enter scoring", () => {
    let game = createInitialState(9);
    game = passOnGame(game);
    assert.equal(game.gameOver, false);
    game = passOnGame(game);
    assert.equal(game.gameOver, true);
    assert.equal(game.phase, "scoring");
    assert.ok(game.result.length > 0);
  });

  it("resign sets the opponent as winner with +R suffix", () => {
    let game = createInitialState(9);
    // Black resigns first move.
    game = resignOnGame(game);
    assert.equal(game.gameOver, true);
    assert.equal(game.phase, "ended");
    assert.equal(game.winner, WHITE);
    assert.equal(game.result, "W+R");
  });

  it("undo restores the previous snapshot", () => {
    let game = createInitialState(9);
    game = play(game, 4, 4);
    const after = serializeBoard(game.board);
    const undone = undoOnGame(game);
    assert.ok(undone, "undo should produce a state");
    assert.notEqual(serializeBoard(undone!.board), after);
    assert.equal(undone!.moveNumber, 0);
  });
});

describe("scoring", () => {
  it("counts territory bordered by a single color", () => {
    // Build a position on 9x9 where black walls off the top-left corner.
    let game = createInitialState(9);
    // Black: (3,0),(3,1),(3,2),(3,3),(2,3),(1,3),(0,3) → wall around top-left
    // 3x3 region (rows 0-2, cols 0-2). White plays elsewhere.
    const blackPoints: Array<[number, number]> = [
      [3, 0],
      [3, 1],
      [3, 2],
      [3, 3],
      [2, 3],
      [1, 3],
      [0, 3],
    ];
    const whitePoints: Array<[number, number]> = [
      [8, 8],
      [7, 8],
      [8, 7],
      [6, 8],
      [8, 6],
      [5, 8],
      [8, 5],
    ];
    for (let i = 0; i < blackPoints.length; i += 1) {
      game = play(game, blackPoints[i][0], blackPoints[i][1]);
      game = play(game, whitePoints[i][0], whitePoints[i][1]);
    }
    const score = computeScore(toSnapshot(game));
    // The 3x3 corner (9 points) is bordered only by Black → 9 territory.
    assert.equal(score.blackTerritory, 9);
    // Komi must be added to white's total.
    assert.equal(score.whiteTotal, score.whiteTerritory + KOMI);
  });

  it("ignores neutral regions bordered by both colors", () => {
    let game = createInitialState(9);
    // Black at (4,0), White at (4,1). Empty point at (4,2) borders both via
    // chains; the empty top-of-board region is dame.
    game = play(game, 4, 0); // B
    game = play(game, 4, 1); // W
    const score = computeScore(toSnapshot(game));
    assert.equal(score.blackTerritory, 0);
    assert.equal(score.whiteTerritory, 0);
  });
});

describe("SGF export", () => {
  it("emits a header with size and komi and one node per move", () => {
    let game = createInitialState(9);
    game = play(game, 4, 4); // B at tengen
    game = play(game, 2, 2); // W
    game = passOnGame(game); // B passes
    const sgf = buildSgf(toSnapshot(game));
    assert.match(sgf, /^\(;GM\[1\]FF\[4\]/);
    assert.match(sgf, /SZ\[9\]/);
    assert.match(sgf, new RegExp(`KM\\[${KOMI}\\]`));
    assert.match(sgf, /;B\[ee\]/); // (4,4) → "ee"
    assert.match(sgf, /;W\[cc\]/); // (2,2) → "cc"
    assert.match(sgf, /;B\[\]/); // pass → empty point
    assert.ok(sgf.endsWith(")"));
  });

  it("includes a result tag when the game has ended", () => {
    let game = createInitialState(9);
    game = resignOnGame(game);
    const sgf = buildSgf(toSnapshot(game));
    assert.match(sgf, /RE\[W\+R\]/);
  });
});
