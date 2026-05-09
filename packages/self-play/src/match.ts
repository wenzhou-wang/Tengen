import {
  BLACK,
  GAME_CORE_VERSION,
  KOMI,
  WHITE,
  buildSgf,
  colorLetter,
  coordName,
  createInitialState,
  getPublicState,
  passOnGame,
  playMoveOnGame,
  resignOnGame,
  serializeBoard,
  type BoardSize,
  type ControllerMove,
  type GameState,
  type PlayerColor,
} from "@tengen/game-core";
import { createBot, type BotId } from "@tengen/ai-bots";

import { computeRecordId, derivePlayerSeed } from "./ids.ts";
import {
  TRAINING_RECORD_SCHEMA_VERSION,
  type Color,
  type GameEndReason,
  type PlayerIdentity,
  type TrainingMove,
  type TrainingRecord,
} from "./types.ts";

export interface MatchConfig {
  boardSize: BoardSize;
  black: BotId;
  white: BotId;
  /** Master seed; per-player seeds are derived from this. */
  seed: number;
  /**
   * Hard cap on plies before the match is truncated as `max-moves`.
   * Defaults to `4 * size * size` which is generous enough for realistic
   * games and a strong guard against pathological loops.
   */
  maxMoves?: number;
  /**
   * Override the wall-clock used for `generatedAt`. Pass a fixed Date in
   * tests for deterministic record output.
   */
  now?: () => Date;
}

export interface MatchResult {
  record: TrainingRecord;
  sgf: string;
  game: GameState;
}

const COLOR_TO_LETTER: Record<PlayerColor, Color> = {
  [BLACK]: "B",
  [WHITE]: "W",
};

/**
 * Drive a single AI-vs-AI game from the initial position to a terminal
 * state (or `maxMoves` truncation), returning a TrainingRecord and SGF.
 */
export async function playMatch(config: MatchConfig): Promise<MatchResult> {
  const maxMoves = config.maxMoves ?? 4 * config.boardSize * config.boardSize;
  const now = config.now ?? (() => new Date());

  const blackSeed = derivePlayerSeed(config.seed, "B");
  const whiteSeed = derivePlayerSeed(config.seed, "W");

  const blackBot = createBot(config.black, { seed: blackSeed });
  const whiteBot = createBot(config.white, { seed: whiteSeed });

  const blackIdentity: PlayerIdentity = {
    id: blackBot.id,
    version: blackBot.version,
    kind: blackBot.kind,
    seed: blackSeed,
  };
  const whiteIdentity: PlayerIdentity = {
    id: whiteBot.id,
    version: whiteBot.version,
    kind: whiteBot.kind,
    seed: whiteSeed,
  };

  let game = createInitialState(config.boardSize);
  const moves: TrainingMove[] = [];
  let endReason: GameEndReason = "max-moves";

  while (!game.gameOver && moves.length < maxMoves) {
    const color = game.current;
    const colorLabel = COLOR_TO_LETTER[color];
    const bot = color === BLACK ? blackBot : whiteBot;
    const state = getPublicState(game);
    const decision = await bot.getMove(state);
    const applied = applyDecision(game, decision, colorLabel);

    if (applied.kind === "play") {
      moves.push({
        number: applied.game.moveNumber,
        color: colorLabel,
        type: "play",
        x: applied.x,
        y: applied.y,
        coord: coordName(applied.x, applied.y, game.size),
        captures: applied.captures,
      });
      game = applied.game;
      continue;
    }

    if (applied.kind === "pass") {
      moves.push({
        number: game.moveNumber + 1, // post-move number
        color: colorLabel,
        type: "pass",
      });
      game = applied.game;
      if (game.gameOver) {
        endReason = "two-pass";
      }
      continue;
    }

    if (applied.kind === "resign") {
      moves.push({
        number: game.moveNumber + 1,
        color: colorLabel,
        type: "resign",
      });
      game = applied.game;
      endReason = "resign";
      continue;
    }

    if (applied.kind === "no-legal") {
      // Should not happen — bots return pass when no legal moves exist —
      // but guard against a rogue bot returning null/undefined.
      const passed = passOnGame(game);
      moves.push({ number: game.moveNumber + 1, color: colorLabel, type: "pass" });
      game = passed;
      if (game.gameOver) endReason = "two-pass";
      continue;
    }
  }

  if (!game.gameOver && moves.length >= maxMoves) {
    endReason = "max-moves";
  }

  const recordId = computeRecordId({
    boardSize: config.boardSize,
    seed: config.seed,
    black: { id: blackBot.id, version: blackBot.version },
    white: { id: whiteBot.id, version: whiteBot.version },
    rulesPackageVersion: GAME_CORE_VERSION,
  });

  const winner = game.winner ? COLOR_TO_LETTER[game.winner] : null;

  const record: TrainingRecord = {
    schemaVersion: TRAINING_RECORD_SCHEMA_VERSION,
    recordId,
    rulesPackageVersion: GAME_CORE_VERSION,
    generatedAt: now().toISOString(),
    boardSize: config.boardSize,
    komi: KOMI,
    seed: config.seed >>> 0,
    players: { B: blackIdentity, W: whiteIdentity },
    moves,
    result: game.result || "",
    winner,
    finalBoard: serializeBoard(game.board),
    terminal: game.gameOver,
    endReason,
  };

  return { record, sgf: buildSgf(game), game };
}

interface AppliedPlay {
  kind: "play";
  game: GameState;
  x: number;
  y: number;
  captures: number;
}
interface AppliedTerminal {
  kind: "pass" | "resign" | "no-legal";
  game: GameState;
}
type Applied = AppliedPlay | AppliedTerminal;

function applyDecision(game: GameState, decision: ControllerMove, color: Color): Applied {
  if (decision == null) {
    // Treat undefined / null as "no decision"; force a pass.
    return { kind: "no-legal", game };
  }
  if (typeof decision === "object" && "resign" in decision && decision.resign) {
    return { kind: "resign", game: resignOnGame(game) };
  }
  if (typeof decision === "object" && "pass" in decision && decision.pass) {
    return { kind: "pass", game: passOnGame(game) };
  }
  if (typeof decision === "object" && "x" in decision && "y" in decision) {
    const next = playMoveOnGame(game, decision.x, decision.y);
    if ("error" in next) {
      // Illegal bot move — treat as a pass and continue. The replayer will
      // see the pass in the record and stay legal; the engine's authority
      // is preserved.
      return { kind: "pass", game: passOnGame(game) };
    }
    return {
      kind: "play",
      game: next,
      x: decision.x,
      y: decision.y,
      captures: next.captures[game.current] - game.captures[game.current],
    };
  }
  return { kind: "no-legal", game };
}

export function describeResultLetter(record: TrainingRecord): string {
  if (record.winner === null) return "?";
  return record.winner;
}

export function colorLetterFromState(color: PlayerColor): Color {
  return colorLetter(color);
}
