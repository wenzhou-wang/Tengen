import type { LegalMove, PlayerColor, PlayerController, PublicGameState } from "@tengen/game-core";
import { BLACK, EMPTY, WHITE, type BoardSize } from "@tengen/game-core";

export * from "@tengen/game-core";

export interface BoardSettings {
  showCoordinates: boolean;
  showPreview: boolean;
}

export interface BoardMetrics {
  size: number;
  margin: number;
  gridSize: number;
  step: number;
}

export interface PlayMoveOptions {
  fromController?: boolean;
  quiet?: boolean;
}

export interface TengenApi {
  colors: {
    EMPTY: typeof EMPTY;
    BLACK: typeof BLACK;
    WHITE: typeof WHITE;
  };
  getState(): PublicGameState;
  getLegalMoves(color?: PlayerColor): LegalMove[];
  playMove(x: number, y: number): boolean;
  pass(): void;
  undo(): void;
  newGame(size: BoardSize | number): void;
  setController(color: PlayerColor, controller?: PlayerController | null): void;
}
