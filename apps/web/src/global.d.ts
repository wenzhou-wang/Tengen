/// <reference types="vite/client" />

export {};

declare global {
  type WeiqiBoardValue = 0 | 1 | 2;
  type WeiqiPlayerColor = 1 | 2;
  type WeiqiBoardSize = 9 | 13 | 19;

  interface WeiqiPoint {
    x: number;
    y: number;
  }

  interface WeiqiLegalMove extends WeiqiPoint {
    coord: string;
  }

  interface WeiqiPublicState {
    size: WeiqiBoardSize;
    board: WeiqiBoardValue[][];
    current: WeiqiPlayerColor;
    currentName: string;
    captures: {
      black: number;
      white: number;
    };
    moveNumber: number;
    passes: number;
    gameOver: boolean;
    legalMoves: WeiqiLegalMove[];
  }

  type WeiqiControllerMove = { pass: true } | WeiqiPoint | null | undefined;

  type WeiqiPlayerController =
    | { type: "human" }
    | {
        type: "ai";
        getMove(state: WeiqiPublicState): WeiqiControllerMove | Promise<WeiqiControllerMove>;
      };

  interface Window {
    Tengen?: {
      colors: {
        EMPTY: 0;
        BLACK: 1;
        WHITE: 2;
      };
      getState(): WeiqiPublicState;
      getLegalMoves(color?: WeiqiPlayerColor): WeiqiLegalMove[];
      playMove(x: number, y: number): boolean;
      pass(): void;
      undo(): void;
      newGame(size: WeiqiBoardSize | number): void;
      setController(color: WeiqiPlayerColor, controller?: WeiqiPlayerController | null): void;
    };
  }
}
