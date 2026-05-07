import type { ControllerMove, PublicGameState } from "@tengen/game-core";

import type { AiMoveContext, AiPlayer } from "./types.ts";

export interface RandomBotOptions {
  rng?: () => number;
  /**
   * Fraction of legal moves below which the bot prefers to pass. Defaults to 0,
   * i.e. play whenever any legal move exists.
   */
  passThreshold?: number;
}

export function createRandomBot(options: RandomBotOptions = {}): AiPlayer {
  const rng = options.rng ?? Math.random;
  const passThreshold = options.passThreshold ?? 0;

  return {
    id: "random-v1",
    label: "Random bot",
    version: "1.0.0",
    kind: "random",
    inferenceMode: "server",
    async getMove(state: PublicGameState, _context?: AiMoveContext): Promise<ControllerMove> {
      if (state.gameOver) return { pass: true };
      const legal = state.legalMoves;
      if (legal.length === 0) return { pass: true };
      if (legal.length / (state.size * state.size) <= passThreshold) {
        return { pass: true };
      }
      const choice = legal[Math.floor(rng() * legal.length)];
      return { x: choice.x, y: choice.y };
    },
  };
}
