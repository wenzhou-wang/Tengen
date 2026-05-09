import type { BoardSize } from "@tengen/game-core";

/**
 * Schema version stamped on every record. Bump on any breaking change
 * (field rename, removed field, semantic change). Additive optional fields
 * may keep the same version.
 */
export const TRAINING_RECORD_SCHEMA_VERSION = 1 as const;
export type TrainingRecordSchemaVersion = typeof TRAINING_RECORD_SCHEMA_VERSION;

export type Color = "B" | "W";

/**
 * Identity of a player in a recorded match. `seed` is the per-player RNG
 * seed actually used (after derivation from the master match seed) so
 * `(record.seed, players.B.seed, players.W.seed)` together fully determine
 * the bots' move choices.
 */
export interface PlayerIdentity {
  id: string;
  version: string;
  kind: "random" | "heuristic" | "external" | "model";
  seed: number;
}

export interface TrainingPlayMove {
  number: number;
  color: Color;
  type: "play";
  x: number;
  y: number;
  coord: string;
  captures: number;
}

export interface TrainingPassMove {
  number: number;
  color: Color;
  type: "pass";
}

export interface TrainingResignMove {
  number: number;
  color: Color;
  type: "resign";
}

export type TrainingMove = TrainingPlayMove | TrainingPassMove | TrainingResignMove;

/**
 * On-disk record for a single self-play game. Designed to be the minimal
 * lossless form: the move list plus terminal info is enough for the replayer
 * to reconstruct every position, and for derived training examples
 * (position, move, value-target) to be generated on demand.
 */
export interface TrainingRecord {
  schemaVersion: TrainingRecordSchemaVersion;
  /** Stable id derived from inputs; identical inputs yield the same id. */
  recordId: string;
  /** Version of @tengen/game-core that produced this record. */
  rulesPackageVersion: string;
  /** ISO 8601 UTC timestamp. */
  generatedAt: string;
  boardSize: BoardSize;
  komi: number;
  /** Master seed for the match. Per-player seeds are derived from it. */
  seed: number;
  players: { B: PlayerIdentity; W: PlayerIdentity };
  moves: TrainingMove[];
  /**
   * Final SGF result string ("B+R", "W+6.5", "B+T", etc.). Empty if the
   * game did not reach a terminal state (e.g. truncated by maxMoves).
   */
  result: string;
  winner: Color | null;
  /** Serialized final board, "/" between rows (engine.serializeBoard). */
  finalBoard: string;
  /**
   * Whether the game reached a natural terminal state (resign / two passes /
   * timeout). False means the match was truncated.
   */
  terminal: boolean;
  /** Reason the game ended; "two-pass" | "resign" | "max-moves" | "no-legal-moves". */
  endReason: GameEndReason;
}

export type GameEndReason = "two-pass" | "resign" | "max-moves" | "no-legal-moves";

/**
 * Manifest describing a directory of self-play records. Written once per
 * batch run; serves as the dataset's version stamp (rules + bot versions +
 * board sizes + generation date).
 */
export interface BatchManifest {
  schemaVersion: TrainingRecordSchemaVersion;
  rulesPackageVersion: string;
  generatedAt: string;
  baseSeed: number;
  boardSizes: BoardSize[];
  pairings: Array<{ black: string; white: string }>;
  bots: Array<{ id: string; version: string; kind: string }>;
  matchCount: number;
  /** Filenames of the records in this batch, relative to the manifest. */
  records: string[];
}
