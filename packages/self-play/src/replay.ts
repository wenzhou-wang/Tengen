import {
  BLACK,
  WHITE,
  createInitialState,
  passOnGame,
  playMoveOnGame,
  resignOnGame,
  serializeBoard,
  type GameState,
  type PlayerColor,
} from "@tengen/game-core";

import type { Color, TrainingMove, TrainingRecord } from "./types.ts";

export interface ReplaySuccess {
  ok: true;
  game: GameState;
}

export interface ReplayFailure {
  ok: false;
  error: string;
  failedAtMoveIndex?: number;
}

export type ReplayResult = ReplaySuccess | ReplayFailure;

/**
 * Reconstruct a game from a TrainingRecord by replaying every move through
 * the shared rules engine. Verifies:
 *
 *  - every move is legal at the point it occurs;
 *  - the color whose turn it is matches the record;
 *  - the final board matches `record.finalBoard`;
 *  - the terminal flag and result match `record.terminal` / `record.result`.
 *
 * If any check fails, returns `{ ok: false, error, failedAtMoveIndex? }`.
 */
export function replayRecord(record: TrainingRecord): ReplayResult {
  let game = createInitialState(record.boardSize);

  for (let i = 0; i < record.moves.length; i += 1) {
    const move = record.moves[i];
    const expectedColor: PlayerColor = move.color === "B" ? BLACK : WHITE;
    if (game.gameOver) {
      return { ok: false, error: `Move ${i} (#${move.number}) follows a terminal state.`, failedAtMoveIndex: i };
    }
    if (game.current !== expectedColor) {
      return {
        ok: false,
        error: `Move ${i} (#${move.number}) color ${move.color} does not match game.current.`,
        failedAtMoveIndex: i,
      };
    }

    const stepError = stepMove(game, move);
    if ("error" in stepError) {
      return { ok: false, error: `Move ${i} (#${move.number}): ${stepError.error}`, failedAtMoveIndex: i };
    }
    game = stepError.game;
  }

  const finalBoard = serializeBoard(game.board);
  if (finalBoard !== record.finalBoard) {
    return {
      ok: false,
      error: "Final board after replay does not match record.finalBoard.",
    };
  }

  if (game.gameOver !== record.terminal) {
    return {
      ok: false,
      error: `Replay terminal=${game.gameOver} disagrees with record.terminal=${record.terminal}.`,
    };
  }

  if (record.terminal && game.result !== record.result) {
    return {
      ok: false,
      error: `Replay result "${game.result}" disagrees with record.result "${record.result}".`,
    };
  }

  if (record.terminal) {
    const expectedWinner: Color | null = game.winner === BLACK ? "B" : game.winner === WHITE ? "W" : null;
    if (expectedWinner !== record.winner) {
      return {
        ok: false,
        error: `Replay winner ${expectedWinner ?? "null"} disagrees with record.winner ${record.winner ?? "null"}.`,
      };
    }
  }

  return { ok: true, game };
}

function stepMove(game: GameState, move: TrainingMove): { game: GameState } | { error: string } {
  if (move.type === "pass") return { game: passOnGame(game) };
  if (move.type === "resign") return { game: resignOnGame(game) };
  const next = playMoveOnGame(game, move.x, move.y);
  if ("error" in next) return { error: next.error };
  return { game: next };
}

/**
 * Iterate (position-before-move, move, value-target) tuples for a record.
 * Useful as a trainer-facing view: positions are reconstructed lazily by
 * replay, so disk records stay compact.
 *
 * `value` is +1 if the side-to-move at that position eventually won the
 * game, -1 if they lost, 0 if no terminal winner (truncated / two-pass tie
 * — the latter cannot happen with KOMI 6.5 but the field is still defined).
 */
export function* iterateTrainingExamples(record: TrainingRecord): Generator<{
  position: GameState;
  move: TrainingMove;
  value: -1 | 0 | 1;
}> {
  let game = createInitialState(record.boardSize);
  for (const move of record.moves) {
    const value = perspectiveValue(record, move.color);
    yield { position: cloneState(game), move, value };
    const step = stepMove(game, move);
    if ("error" in step) return;
    game = step.game;
  }
}

function perspectiveValue(record: TrainingRecord, mover: Color): -1 | 0 | 1 {
  if (record.winner === null) return 0;
  return record.winner === mover ? 1 : -1;
}

function cloneState(game: GameState): GameState {
  return {
    ...game,
    board: game.board.map((row) => row.slice()),
    captures: { ...game.captures },
    moveLog: game.moveLog.slice(),
    positionHistory: game.positionHistory.slice(),
    history: game.history.slice(),
    lastMove: game.lastMove ? { ...game.lastMove } : null,
  };
}
