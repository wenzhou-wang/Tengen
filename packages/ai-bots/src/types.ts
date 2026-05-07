import type { ControllerMove, PublicGameState } from "@tengen/game-core";

export type AiPlayerKind = "random" | "heuristic" | "external" | "model";

export type InferenceMode = "server" | "browser";

export interface AiClockContext {
  /** Maximum wall-time allowed for this single move. */
  budgetMs: number;
  /** Remaining main time for this player, in ms. */
  mainRemainingMs: number;
  /** True if this player is in byoyomi (no main time left). */
  inByoyomi: boolean;
  /** Per-byoyomi-move budget, in ms; 0 if no byoyomi configured. */
  byoyomiMs: number;
}

export interface AiMoveContext {
  /** Time-control context. Absent for unlimited games. */
  clock?: AiClockContext;
}

export interface AiPlayer {
  id: string;
  label: string;
  version: string;
  kind: AiPlayerKind;
  inferenceMode: InferenceMode;
  getMove(gameState: PublicGameState, context?: AiMoveContext): Promise<ControllerMove>;
}

export interface AiMoveLog {
  sessionId: string;
  moveNumber: number;
  color: "B" | "W";
  bot: { id: string; version: string; kind: AiPlayerKind };
  decision: { type: "play"; x: number; y: number; coord: string } | { type: "pass" } | { type: "resign" };
  durationMs: number;
}
