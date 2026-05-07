import { randomUUID } from "node:crypto";

import {
  applyElapsed,
  BLACK,
  WHITE,
  buildSgf,
  isSupportedBoardSize,
  passOnGame,
  playMoveOnGame,
  resignOnGame,
  toSnapshot,
  undoOnGame,
  type BoardSize,
  type GameState,
  type PlayerColor,
  type SessionClocks,
  type TimeControl,
} from "@tengen/game-core";
import { isBotId, type BotId, createBot } from "@tengen/ai-bots";

import type { EventBus } from "./events.ts";
import type {
  PlayerSpec,
  SessionMode,
  SessionPlayers,
  SessionRecord,
  SessionStore,
} from "./store.ts";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface PlayerSpecInput {
  kind?: string;
  id?: string;
}

export interface TimeControlInput {
  mainTimeSeconds?: number;
  byoyomiSeconds?: number;
}

export interface CreateSessionInput {
  size?: number;
  players?: { black?: PlayerSpecInput; white?: PlayerSpecInput };
  timeControl?: TimeControlInput | null;
}

export type Actor = "human" | "bot";

export interface ActorOptions {
  actor?: Actor;
}

export interface TimeoutWatcherLike {
  onStateChange(record: SessionRecord): void;
  disarm(id: string): void;
}

const MAX_MAIN_SECONDS = 24 * 60 * 60;
const MAX_BYOYOMI_SECONDS = 600;

function resolvePlayer(input: PlayerSpecInput | undefined, fallback: PlayerSpec): PlayerSpec {
  if (!input) return fallback;
  if (input.kind === "human") return { kind: "human" };
  if (input.kind === "bot") {
    const botId = input.id;
    if (!isBotId(botId)) {
      throw new HttpError(400, `Unknown bot id: ${String(botId)}`);
    }
    const bot = createBot(botId as BotId);
    return { kind: "bot", id: bot.id, label: bot.label, version: bot.version };
  }
  throw new HttpError(400, `Unknown player kind: ${String(input.kind)}`);
}

function deriveMode(players: SessionPlayers): SessionMode {
  const blackBot = players.black.kind === "bot";
  const whiteBot = players.white.kind === "bot";
  if (blackBot && whiteBot) return "aiVsAi";
  if (blackBot || whiteBot) return "humanVsAi";
  return "humanVsHuman";
}

function resolveTimeControl(input: TimeControlInput | null | undefined): TimeControl | null {
  if (!input) return null;
  const main = input.mainTimeSeconds;
  const byo = input.byoyomiSeconds;
  if (main === undefined && byo === undefined) return null;
  const mainTimeSeconds = main === undefined ? 0 : Number(main);
  const byoyomiSeconds = byo === undefined ? 0 : Number(byo);
  if (!Number.isFinite(mainTimeSeconds) || !Number.isFinite(byoyomiSeconds)) {
    throw new HttpError(400, "Time control fields must be finite numbers.");
  }
  if (mainTimeSeconds < 0 || byoyomiSeconds < 0) {
    throw new HttpError(400, "Time control fields must be non-negative.");
  }
  if (mainTimeSeconds > MAX_MAIN_SECONDS) {
    throw new HttpError(400, `mainTimeSeconds must be at most ${MAX_MAIN_SECONDS}.`);
  }
  if (byoyomiSeconds > MAX_BYOYOMI_SECONDS) {
    throw new HttpError(400, `byoyomiSeconds must be at most ${MAX_BYOYOMI_SECONDS}.`);
  }
  if (mainTimeSeconds === 0 && byoyomiSeconds === 0) return null;
  return {
    mainTimeSeconds: Math.round(mainTimeSeconds),
    byoyomiSeconds: Math.round(byoyomiSeconds),
  };
}

function colorKey(color: PlayerColor): "black" | "white" {
  return color === BLACK ? "black" : "white";
}

interface ClockTickOutcome {
  record: SessionRecord;
  lostColor: PlayerColor | null;
}

function tickClock(record: SessionRecord, now: number): ClockTickOutcome {
  if (!record.clocks || !record.timeControl || record.clocks.turnStartedAt === null) {
    return { record, lostColor: null };
  }
  const tc = record.timeControl;
  const playerKey = colorKey(record.game.current);
  const clock = record.clocks[playerKey];
  const elapsed = Math.max(0, now - record.clocks.turnStartedAt);
  const result = applyElapsed(clock, elapsed, tc);
  const nextClocks: SessionClocks = {
    ...record.clocks,
    [playerKey]: result.clock,
  };
  return {
    record: { ...record, clocks: nextClocks },
    lostColor: result.lostOnTime ? record.game.current : null,
  };
}

function withTurnStarted(record: SessionRecord, game: GameState, now: number): SessionRecord {
  if (!record.clocks) {
    return { ...record, game };
  }
  const turnStartedAt = game.gameOver ? null : now;
  return {
    ...record,
    game,
    clocks: { ...record.clocks, turnStartedAt },
  };
}

function finalizeTimeoutLoss(record: SessionRecord, lostColor: PlayerColor): SessionRecord {
  const winner: PlayerColor = lostColor === BLACK ? WHITE : BLACK;
  const winnerLetter = winner === BLACK ? "B" : "W";
  const result = `${winnerLetter}+T`;
  const game: GameState = {
    ...record.game,
    moveNumber: record.game.moveNumber + 1,
    gameOver: true,
    phase: "ended",
    winner,
    result,
    history: [...record.game.history, toSnapshot(record.game)],
  };
  const nextClocks: SessionClocks | null = record.clocks
    ? { ...record.clocks, turnStartedAt: null }
    : record.clocks;
  return { ...record, game, clocks: nextClocks };
}

export class SessionService {
  #watcher: TimeoutWatcherLike | null = null;

  constructor(
    readonly store: SessionStore,
    readonly bus: EventBus,
  ) {}

  setTimeoutWatcher(watcher: TimeoutWatcherLike | null): void {
    this.#watcher = watcher;
  }

  create(input: CreateSessionInput): SessionRecord {
    const size = Number(input.size ?? 19);
    if (!isSupportedBoardSize(size)) {
      throw new HttpError(400, `Unsupported board size: ${input.size}`);
    }
    const players: SessionPlayers = {
      black: resolvePlayer(input.players?.black, { kind: "human" }),
      white: resolvePlayer(input.players?.white, { kind: "human" }),
    };
    const mode = deriveMode(players);
    const timeControl = resolveTimeControl(input.timeControl);
    const record = this.store.create({
      id: randomUUID(),
      mode,
      size: size as BoardSize,
      players,
      timeControl,
    });
    this.#emit(record);
    return record;
  }

  #assertHumanTurn(id: string, action: string): void {
    const record = this.store.get(id);
    if (!record) throw new HttpError(404, `Session not found: ${id}`);
    if (record.game.gameOver) return;
    const playerKey = colorKey(record.game.current);
    if (record.players[playerKey].kind !== "human") {
      throw new HttpError(409, `Cannot ${action}: it is the bot's turn.`);
    }
  }

  peek(id: string): SessionRecord | undefined {
    return this.store.get(id);
  }

  get(id: string): SessionRecord {
    const record = this.store.get(id);
    if (!record) throw new HttpError(404, `Session not found: ${id}`);
    return record;
  }

  playMove(id: string, x: number, y: number, options: ActorOptions = {}): SessionRecord {
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      throw new HttpError(400, "Move coordinates must be integers.");
    }
    if ((options.actor ?? "human") === "human") {
      this.#assertHumanTurn(id, "play a move");
    }
    const now = Date.now();
    const updated = this.store.update(id, (record) => {
      if (record.game.gameOver) {
        throw new HttpError(409, "The game is already over.");
      }
      const ticked = tickClock(record, now);
      if (ticked.lostColor) {
        return finalizeTimeoutLoss(ticked.record, ticked.lostColor);
      }
      const next = playMoveOnGame(ticked.record.game, x, y);
      if ("error" in next) {
        throw new HttpError(409, next.error);
      }
      return withTurnStarted(ticked.record, next, now);
    });
    if (!updated) throw new HttpError(404, `Session not found: ${id}`);
    this.#emit(updated);
    return updated;
  }

  pass(id: string, options: ActorOptions = {}): SessionRecord {
    if ((options.actor ?? "human") === "human") {
      this.#assertHumanTurn(id, "pass");
    }
    const now = Date.now();
    const updated = this.store.update(id, (record) => {
      if (record.game.gameOver) {
        throw new HttpError(409, "The game is already over.");
      }
      const ticked = tickClock(record, now);
      if (ticked.lostColor) {
        return finalizeTimeoutLoss(ticked.record, ticked.lostColor);
      }
      return withTurnStarted(ticked.record, passOnGame(ticked.record.game), now);
    });
    if (!updated) throw new HttpError(404, `Session not found: ${id}`);
    this.#emit(updated);
    return updated;
  }

  resign(id: string, options: ActorOptions = {}): SessionRecord {
    if ((options.actor ?? "human") === "human") {
      this.#assertHumanTurn(id, "resign");
    }
    const now = Date.now();
    const updated = this.store.update(id, (record) => {
      if (record.game.gameOver) {
        throw new HttpError(409, "The game is already over.");
      }
      const ticked = tickClock(record, now);
      // A resign closes the game even if the actor was already over time.
      const game = resignOnGame(ticked.record.game);
      return withTurnStarted(ticked.record, game, now);
    });
    if (!updated) throw new HttpError(404, `Session not found: ${id}`);
    this.#emit(updated);
    return updated;
  }

  undo(id: string): SessionRecord {
    const now = Date.now();
    const updated = this.store.update(id, (record) => {
      // Time-loss is terminal. The player's clock has lostOnTime sticky-true,
      // so reviving the game would just trip the watcher immediately. Refuse.
      if (record.clocks && (record.clocks.black.lostOnTime || record.clocks.white.lostOnTime)) {
        throw new HttpError(409, "Cannot undo a time-loss result.");
      }
      const previous = undoOnGame(record.game);
      if (!previous) {
        throw new HttpError(409, "No move to undo.");
      }
      // Undo restarts the displaced player's turn at "now". Their previously
      // deducted main time stays deducted — we don't refund clock spend.
      return withTurnStarted(record, previous, now);
    });
    if (!updated) throw new HttpError(404, `Session not found: ${id}`);
    this.#emit(updated);
    return updated;
  }

  /**
   * Called by the timeout watcher when a player's clock is believed to have
   * expired. Re-checks the clock under the latest record (the timer may be
   * stale if a move arrived first). If still lost, finalizes a time-loss
   * result; otherwise the watcher will re-arm based on the published state.
   */
  timeout(id: string): SessionRecord | null {
    const now = Date.now();
    const updated = this.store.update(id, (record) => {
      if (record.game.gameOver) return record;
      if (!record.clocks || !record.timeControl) return record;
      if (record.clocks.turnStartedAt === null) return record;
      const ticked = tickClock(record, now);
      if (!ticked.lostColor) return record;
      return finalizeTimeoutLoss(ticked.record, ticked.lostColor);
    });
    if (!updated) return null;
    if (updated.game.gameOver) {
      this.#emit(updated);
    }
    return updated;
  }

  exportSgf(id: string): string {
    const record = this.get(id);
    return buildSgf(toSnapshot(record.game), { timeControl: record.timeControl });
  }

  #emit(record: SessionRecord): void {
    this.bus.publish(record.id, { type: "state", session: record });
    this.#watcher?.onStateChange(record);
  }
}
