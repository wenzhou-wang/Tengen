import {
  createInitialClocks,
  createInitialState,
  isUnlimitedTimeControl,
  type BoardSize,
  type GameState,
  type SessionClocks,
  type TimeControl,
} from "@tengen/game-core";

export type SessionMode = "humanVsHuman" | "humanVsAi" | "aiVsAi";

export interface HumanPlayerSpec {
  kind: "human";
}

export interface BotPlayerSpec {
  kind: "bot";
  id: string;
  label: string;
  version: string;
}

export type PlayerSpec = HumanPlayerSpec | BotPlayerSpec;

export interface SessionPlayers {
  black: PlayerSpec;
  white: PlayerSpec;
}

export interface SessionRecord {
  id: string;
  mode: SessionMode;
  size: BoardSize;
  createdAt: string;
  updatedAt: string;
  players: SessionPlayers;
  game: GameState;
  /** Null if the session has no time control (unlimited). */
  timeControl: TimeControl | null;
  /** Null if the session has no time control. */
  clocks: SessionClocks | null;
}

export interface SessionStore {
  create(input: {
    id: string;
    mode: SessionMode;
    size: BoardSize;
    players: SessionPlayers;
    timeControl: TimeControl | null;
  }): SessionRecord;
  get(id: string): SessionRecord | undefined;
  update(id: string, mutate: (record: SessionRecord) => SessionRecord): SessionRecord | undefined;
  list(): SessionRecord[];
  delete(id: string): boolean;
}

export class InMemorySessionStore implements SessionStore {
  readonly #sessions = new Map<string, SessionRecord>();

  create(input: {
    id: string;
    mode: SessionMode;
    size: BoardSize;
    players: SessionPlayers;
    timeControl: TimeControl | null;
  }): SessionRecord {
    const now = new Date().toISOString();
    const tc = input.timeControl;
    const useClocks = tc && !isUnlimitedTimeControl(tc);
    const record: SessionRecord = {
      id: input.id,
      mode: input.mode,
      size: input.size,
      createdAt: now,
      updatedAt: now,
      players: input.players,
      game: createInitialState(input.size),
      timeControl: useClocks ? tc : null,
      clocks: useClocks ? createInitialClocks(tc, Date.now()) : null,
    };
    this.#sessions.set(record.id, record);
    return record;
  }

  get(id: string): SessionRecord | undefined {
    return this.#sessions.get(id);
  }

  update(
    id: string,
    mutate: (record: SessionRecord) => SessionRecord,
  ): SessionRecord | undefined {
    const existing = this.#sessions.get(id);
    if (!existing) return undefined;
    const mutated = mutate(existing);
    const next: SessionRecord = {
      ...mutated,
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
