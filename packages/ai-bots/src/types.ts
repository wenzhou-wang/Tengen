import type { ControllerMove, PublicGameState } from "@tengen/game-core";

export type AiPlayerKind = "random" | "heuristic" | "external" | "model";

export type InferenceMode = "server" | "browser";

export interface AiPlayer {
  id: string;
  label: string;
  version: string;
  kind: AiPlayerKind;
  inferenceMode: InferenceMode;
  getMove(gameState: PublicGameState): Promise<ControllerMove>;
}

export interface AiMoveLog {
  sessionId: string;
  moveNumber: number;
  color: "B" | "W";
  bot: { id: string; version: string; kind: AiPlayerKind };
  decision: { type: "play"; x: number; y: number; coord: string } | { type: "pass" } | { type: "resign" };
  durationMs: number;
}
