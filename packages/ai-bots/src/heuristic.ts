import {
  BLACK,
  EMPTY,
  WHITE,
  type Board,
  type ControllerMove,
  type LegalMove,
  type PlayerColor,
  type PublicGameState,
} from "@tengen/game-core";

import type { AiPlayer } from "./types.ts";

export interface HeuristicBotOptions {
  rng?: () => number;
  /**
   * Random jitter added to each candidate score so identical scores break ties
   * unpredictably. Set to 0 for deterministic behavior in tests.
   */
  jitter?: number;
}

interface MoveEvaluation {
  captures: number;
  ownLiberties: number;
  enemyAtariSaved: boolean;
  selfAtariCreated: boolean;
}

function cloneBoard(board: Board): Board {
  return board.map((row) => row.slice());
}

function neighbors(x: number, y: number, size: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  if (x > 0) out.push([x - 1, y]);
  if (x < size - 1) out.push([x + 1, y]);
  if (y > 0) out.push([x, y - 1]);
  if (y < size - 1) out.push([x, y + 1]);
  return out;
}

function collectGroup(board: Board, sx: number, sy: number, size: number) {
  const color = board[sy][sx];
  const stones: Array<[number, number]> = [];
  const liberties = new Set<string>();
  const seen = new Set<string>();
  const stack: Array<[number, number]> = [[sx, sy]];
  while (stack.length) {
    const cell = stack.pop();
    if (!cell) continue;
    const [x, y] = cell;
    const key = `${x},${y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    stones.push([x, y]);
    for (const [nx, ny] of neighbors(x, y, size)) {
      const v = board[ny][nx];
      if (v === EMPTY) liberties.add(`${nx},${ny}`);
      else if (v === color && !seen.has(`${nx},${ny}`)) stack.push([nx, ny]);
    }
  }
  return { stones, liberties };
}

function other(color: PlayerColor): PlayerColor {
  return color === BLACK ? WHITE : BLACK;
}

function findOpponentAtariGroups(board: Board, color: PlayerColor): number {
  const opp = other(color);
  const size = board.length;
  const seen = new Set<string>();
  let groups = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (board[y][x] !== opp) continue;
      const key = `${x},${y}`;
      if (seen.has(key)) continue;
      const group = collectGroup(board, x, y, size);
      for (const [gx, gy] of group.stones) seen.add(`${gx},${gy}`);
      if (group.liberties.size === 1) groups += 1;
    }
  }
  return groups;
}

function evaluatePlay(
  board: Board,
  size: number,
  color: PlayerColor,
  x: number,
  y: number,
): MoveEvaluation {
  const next = cloneBoard(board);
  next[y][x] = color;
  const opp = other(color);

  const enemyAtariBefore = findOpponentAtariGroups(board, color);

  let captures = 0;
  for (const [nx, ny] of neighbors(x, y, size)) {
    if (next[ny][nx] !== opp) continue;
    const group = collectGroup(next, nx, ny, size);
    if (group.liberties.size > 0) continue;
    captures += group.stones.length;
    for (const [gx, gy] of group.stones) next[gy][gx] = EMPTY;
  }

  const ownGroup = collectGroup(next, x, y, size);
  const ownLiberties = ownGroup.liberties.size;

  const enemyAtariAfter = findOpponentAtariGroups(next, color);

  return {
    captures,
    ownLiberties,
    enemyAtariSaved: enemyAtariAfter < enemyAtariBefore,
    selfAtariCreated: ownLiberties === 1 && captures === 0,
  };
}

function distanceFromEdge(x: number, y: number, size: number): number {
  return Math.min(x, y, size - 1 - x, size - 1 - y);
}

function positionScore(x: number, y: number, size: number): number {
  // Prefer 3rd and 4th line approaches in the opening; punish 1st-line moves
  // on an open board.
  const d = distanceFromEdge(x, y, size);
  if (d === 0) return -3;
  if (d === 1) return 0;
  if (d === 2) return 4;
  if (d === 3) return 3;
  // Center bonus mid-game (small).
  return 1;
}

function pickBestMove(
  board: Board,
  size: number,
  color: PlayerColor,
  legal: readonly LegalMove[],
  jitter: number,
  rng: () => number,
): { move: LegalMove; score: number } | null {
  let best: { move: LegalMove; score: number } | null = null;

  for (const candidate of legal) {
    const evalResult = evaluatePlay(board, size, color, candidate.x, candidate.y);
    let score = 0;
    score += evalResult.captures * 50;
    score += evalResult.ownLiberties * 2;
    if (evalResult.selfAtariCreated) score -= 30;
    if (evalResult.enemyAtariSaved) score -= 5; // mild signal: opponent escaped atari
    score += positionScore(candidate.x, candidate.y, size);
    if (jitter > 0) score += rng() * jitter;

    if (!best || score > best.score) best = { move: candidate, score };
  }

  return best;
}

export function createHeuristicBot(options: HeuristicBotOptions = {}): AiPlayer {
  const rng = options.rng ?? Math.random;
  const jitter = options.jitter ?? 0.5;

  return {
    id: "heuristic-v1",
    label: "Heuristic bot",
    version: "1.0.0",
    kind: "heuristic",
    inferenceMode: "server",
    async getMove(state: PublicGameState): Promise<ControllerMove> {
      if (state.gameOver) return { pass: true };
      if (state.legalMoves.length === 0) return { pass: true };

      const best = pickBestMove(
        state.board,
        state.size,
        state.current,
        state.legalMoves,
        jitter,
        rng,
      );
      if (!best) return { pass: true };

      // If our best move is strictly worse than passing (negative-scoring,
      // late game, opponent already passed), prefer to pass.
      if (best.score < 0 && state.passes >= 1) return { pass: true };

      return { x: best.move.x, y: best.move.y };
    },
  };
}
