import { randomUUID } from "node:crypto";

import {
  BLACK,
  buildSgf,
  isSupportedBoardSize,
  passOnGame,
  playMoveOnGame,
  resignOnGame,
  toSnapshot,
  undoOnGame,
  type BoardSize,
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

export interface CreateSessionInput {
  size?: number;
  players?: { black?: PlayerSpecInput; white?: PlayerSpecInput };
}

export type Actor = "human" | "bot";

export interface ActorOptions {
  actor?: Actor;
}

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

export class SessionService {
  constructor(
    readonly store: SessionStore,
    readonly bus: EventBus,
  ) {}

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
    const record = this.store.create({
      id: randomUUID(),
      mode,
      size: size as BoardSize,
      players,
    });
    this.bus.publish(record.id, { type: "state", session: record });
    return record;
  }

  #assertHumanTurn(id: string, action: string): void {
    const record = this.store.get(id);
    if (!record) throw new HttpError(404, `Session not found: ${id}`);
    if (record.game.gameOver) return; // let the existing 409 fire downstream
    const colorKey = record.game.current === BLACK ? "black" : "white";
    if (record.players[colorKey].kind !== "human") {
      throw new HttpError(409, `Cannot ${action}: it is the bot's turn.`);
    }
  }

  /** Like get(), but returns undefined instead of throwing for missing sessions. */
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
    const updated = this.store.update(id, (game) => {
      const next = playMoveOnGame(game, x, y);
      if ("error" in next) {
        throw new HttpError(409, next.error);
      }
      return next;
    });
    if (!updated) throw new HttpError(404, `Session not found: ${id}`);
    this.bus.publish(id, { type: "state", session: updated });
    return updated;
  }

  pass(id: string, options: ActorOptions = {}): SessionRecord {
    if ((options.actor ?? "human") === "human") {
      this.#assertHumanTurn(id, "pass");
    }
    const updated = this.store.update(id, (game) => {
      if (game.gameOver) {
        throw new HttpError(409, "The game is already over.");
      }
      return passOnGame(game);
    });
    if (!updated) throw new HttpError(404, `Session not found: ${id}`);
    this.bus.publish(id, { type: "state", session: updated });
    return updated;
  }

  resign(id: string, options: ActorOptions = {}): SessionRecord {
    if ((options.actor ?? "human") === "human") {
      this.#assertHumanTurn(id, "resign");
    }
    const updated = this.store.update(id, (game) => {
      if (game.gameOver) {
        throw new HttpError(409, "The game is already over.");
      }
      return resignOnGame(game);
    });
    if (!updated) throw new HttpError(404, `Session not found: ${id}`);
    this.bus.publish(id, { type: "state", session: updated });
    return updated;
  }

  undo(id: string): SessionRecord {
    const updated = this.store.update(id, (game) => {
      const previous = undoOnGame(game);
      if (!previous) {
        throw new HttpError(409, "No move to undo.");
      }
      return previous;
    });
    if (!updated) throw new HttpError(404, `Session not found: ${id}`);
    this.bus.publish(id, { type: "state", session: updated });
    return updated;
  }

  exportSgf(id: string): string {
    const record = this.get(id);
    return buildSgf(toSnapshot(record.game));
  }
}
