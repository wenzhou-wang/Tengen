import { createInitialState, type BoardSize, type GameState } from "@tengen/game-core";

export type SessionMode = "humanVsHuman" | "humanVsAi" | "aiVsAi";

export interface SessionRecord {
  id: string;
  mode: SessionMode;
  size: BoardSize;
  createdAt: string;
  updatedAt: string;
  game: GameState;
}

export interface SessionStore {
  create(input: { id: string; mode: SessionMode; size: BoardSize }): SessionRecord;
  get(id: string): SessionRecord | undefined;
  update(id: string, mutate: (game: GameState) => GameState): SessionRecord | undefined;
  list(): SessionRecord[];
  delete(id: string): boolean;
}

export class InMemorySessionStore implements SessionStore {
  readonly #sessions = new Map<string, SessionRecord>();

  create(input: { id: string; mode: SessionMode; size: BoardSize }): SessionRecord {
    const now = new Date().toISOString();
    const record: SessionRecord = {
      id: input.id,
      mode: input.mode,
      size: input.size,
      createdAt: now,
      updatedAt: now,
      game: createInitialState(input.size),
    };
    this.#sessions.set(record.id, record);
    return record;
  }

  get(id: string): SessionRecord | undefined {
    return this.#sessions.get(id);
  }

  update(id: string, mutate: (game: GameState) => GameState): SessionRecord | undefined {
    const existing = this.#sessions.get(id);
    if (!existing) return undefined;
    const next: SessionRecord = {
      ...existing,
      game: mutate(existing.game),
      updatedAt: new Date().toISOString(),
    };
    this.#sessions.set(id, next);
    return next;
  }

  list(): SessionRecord[] {
    return Array.from(this.#sessions.values());
  }

  delete(id: string): boolean {
    return this.#sessions.delete(id);
  }
}
