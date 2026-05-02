export const EMPTY = 0 as const;
export const BLACK = 1 as const;
export const WHITE = 2 as const;
export const KOMI = 6.5;
export const COORD_LETTERS = "ABCDEFGHJKLMNOPQRST".split("");

export type Empty = typeof EMPTY;
export type PlayerColor = typeof BLACK | typeof WHITE;
export type BoardValue = Empty | PlayerColor;
export type Board = BoardValue[][];
export type BoardSize = 9 | 13 | 19;
export type Phase = "playing" | "scoring" | "ended";
export type Coordinate = [number, number];
export type CaptureCounts = Record<PlayerColor, number>;

export interface Point {
  x: number;
  y: number;
}

export interface LastMove extends Point {
  color: PlayerColor;
}

export interface StoneMove extends LastMove {
  type: "move";
  number: number;
  coord: string;
  captures: number;
}

export interface PassMove {
  type: "pass";
  number: number;
  color: PlayerColor;
}

export interface ResignMove {
  type: "resign";
  number: number;
  color: PlayerColor;
}

export type MoveLogEntry = StoneMove | PassMove | ResignMove;

export interface GameSnapshot {
  size: BoardSize;
  board: Board;
  current: PlayerColor;
  captures: CaptureCounts;
  moveNumber: number;
  passes: number;
  phase: Phase;
  gameOver: boolean;
  winner: PlayerColor | null;
  result: string;
  lastMove: LastMove | null;
  moveLog: MoveLogEntry[];
  positionHistory: string[];
}

export interface GameState extends GameSnapshot {
  history: GameSnapshot[];
}

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

export interface Group {
  stones: Coordinate[];
  liberties: Set<string>;
}

export type MoveEvaluation =
  | { legal: true; board: Board; captures: number; hash: string }
  | { legal: false; reason: string };

export interface ScoreEstimate {
  blackTerritory: number;
  whiteTerritory: number;
  blackTotal: number;
  whiteTotal: number;
}

export interface PlayMoveOptions {
  fromController?: boolean;
  quiet?: boolean;
}

export interface LegalMove extends Point {
  coord: string;
}

export interface PublicGameState {
  size: BoardSize;
  board: Board;
  current: PlayerColor;
  currentName: string;
  captures: {
    black: number;
    white: number;
  };
  moveNumber: number;
  passes: number;
  gameOver: boolean;
  legalMoves: LegalMove[];
}

export type ControllerMove = { pass: true } | Point | null | undefined;

export type PlayerController =
  | { type: "human" }
  | {
      type: "ai";
      getMove(state: PublicGameState): ControllerMove | Promise<ControllerMove>;
    };

export interface TengenApi {
  colors: {
    EMPTY: Empty;
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
