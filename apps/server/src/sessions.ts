import { randomUUID } from "node:crypto";

import {
  buildSgf,
  isSupportedBoardSize,
  passOnGame,
  playMoveOnGame,
  resignOnGame,
  toSnapshot,
  undoOnGame,
  type BoardSize,
} from "@tengen/game-core";

import type { EventBus } from "./events.ts";
import type { SessionMode, SessionRecord, SessionStore } from "./store.ts";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const VALID_MODES: SessionMode[] = ["humanVsHuman", "humanVsAi", "aiVsAi"];

export interface CreateSessionInput {
  size?: number;
  mode?: string;
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
    const mode = (input.mode ?? "humanVsHuman") as SessionMode;
    if (!VALID_MODES.includes(mode)) {
      throw new HttpError(400, `Unsupported mode: ${input.mode}`);
    }
    const record = this.store.create({ id: randomUUID(), mode, size: size as BoardSize });
    this.bus.publish(record.id, { type: "state", session: record });
    return record;
  }

  get(id: string): SessionRecord {
    const record = this.store.get(id);
    if (!record) throw new HttpError(404, `Session not found: ${id}`);
    return record;
  }

  playMove(id: string, x: number, y: number): SessionRecord {
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      throw new HttpError(400, "Move coordinates must be integers.");
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

  pass(id: string): SessionRecord {
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

  resign(id: string): SessionRecord {
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
