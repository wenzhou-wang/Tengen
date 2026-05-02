import {
  BLACK,
  COORD_LETTERS,
  EMPTY,
  KOMI,
  WHITE,
  type Board,
  type BoardSize,
  type BoardValue,
  type CaptureCounts,
  type Coordinate,
  type GameSnapshot,
  type GameState,
  type Group,
  type LegalMove,
  type MoveEvaluation,
  type MoveLogEntry,
  type Phase,
  type PlayerColor,
  type PublicGameState,
  type ScoreEstimate,
} from "./types.ts";

export function createInitialState(size: BoardSize): GameState {
  const board = createBoard(size);

  return {
    size,
    board,
    current: BLACK,
    captures: createCaptureCounts(),
    moveNumber: 0,
    passes: 0,
    phase: "playing",
    gameOver: false,
    winner: null,
    result: "",
    lastMove: null,
    moveLog: [],
    positionHistory: [serializeBoard(board)],
    history: [],
  };
}

export function createBoard(size: BoardSize): Board {
  return Array.from({ length: size }, () => Array<BoardValue>(size).fill(EMPTY));
}

export function createCaptureCounts(black = 0, white = 0): CaptureCounts {
  return { [BLACK]: black, [WHITE]: white };
}

export function toBoardSize(value: number): BoardSize {
  if (value === 9 || value === 13 || value === 19) return value;
  return 19;
}

export function isSupportedBoardSize(size: number): size is BoardSize {
  return size === 9 || size === 13 || size === 19;
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.slice());
}

export function cloneMove(move: MoveLogEntry): MoveLogEntry {
  return { ...move };
}

export function cloneSnapshot(snapshot: GameSnapshot): GameSnapshot {
  return {
    size: snapshot.size,
    board: cloneBoard(snapshot.board),
    current: snapshot.current,
    captures: createCaptureCounts(
      Number(snapshot.captures[BLACK] || 0),
      Number(snapshot.captures[WHITE] || 0),
    ),
    moveNumber: snapshot.moveNumber,
    passes: snapshot.passes,
    phase: snapshot.phase,
    gameOver: snapshot.gameOver,
    winner: snapshot.winner,
    result: snapshot.result || "",
    lastMove: snapshot.lastMove ? { ...snapshot.lastMove } : null,
    moveLog: snapshot.moveLog.map(cloneMove),
    positionHistory: snapshot.positionHistory.slice(),
  };
}

export function toSnapshot(game: GameState): GameSnapshot {
  return cloneSnapshot(game);
}

export function restoreSnapshot(snapshot: GameSnapshot, history: GameSnapshot[]): GameState {
  return { ...cloneSnapshot(snapshot), history };
}

export function serializeBoard(board: Board): string {
  return board.map((row) => row.join("")).join("/");
}

export function other(color: PlayerColor): PlayerColor {
  return color === BLACK ? WHITE : BLACK;
}

export function colorName(color: PlayerColor): string {
  return color === BLACK ? "Black" : "White";
}

export function colorLetter(color: PlayerColor): "B" | "W" {
  return color === BLACK ? "B" : "W";
}

export function coordName(x: number, y: number, size: number): string {
  return `${COORD_LETTERS[x]}${size - y}`;
}

export function sgfCoord(x: number, y: number): string {
  return String.fromCharCode(97 + x) + String.fromCharCode(97 + y);
}

export function isOnBoard(x: number, y: number, size: number): boolean {
  return x >= 0 && y >= 0 && x < size && y < size;
}

export function neighbors(x: number, y: number, size: number): Coordinate[] {
  const list: Coordinate[] = [];
  if (x > 0) list.push([x - 1, y]);
  if (x < size - 1) list.push([x + 1, y]);
  if (y > 0) list.push([x, y - 1]);
  if (y < size - 1) list.push([x, y + 1]);
  return list;
}

export function collectGroup(board: Board, startX: number, startY: number): Group {
  const size = board.length;
  const color = board[startY][startX];
  const stones: Coordinate[] = [];
  const liberties = new Set<string>();
  const visited = new Set<string>();
  const stack: Coordinate[] = [[startX, startY]];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    const [x, y] = current;
    const key = `${x},${y}`;
    if (visited.has(key)) continue;

    visited.add(key);
    stones.push([x, y]);

    for (const [nx, ny] of neighbors(x, y, size)) {
      const value = board[ny][nx];
      if (value === EMPTY) {
        liberties.add(`${nx},${ny}`);
      } else if (value === color && !visited.has(`${nx},${ny}`)) {
        stack.push([nx, ny]);
      }
    }
  }

  return { stones, liberties };
}

export function evaluateMove(game: GameSnapshot, x: number, y: number, color: PlayerColor): MoveEvaluation {
  if (game.gameOver || game.phase !== "playing") {
    return { legal: false, reason: "The game is not in a playing phase." };
  }

  if (!isOnBoard(x, y, game.size)) {
    return { legal: false, reason: "That point is outside the board." };
  }

  if (game.board[y][x] !== EMPTY) {
    return { legal: false, reason: "That intersection is occupied." };
  }

  const board = cloneBoard(game.board);
  const opponent = other(color);
  let captures = 0;
  board[y][x] = color;

  for (const [nx, ny] of neighbors(x, y, game.size)) {
    if (board[ny][nx] !== opponent) continue;

    const group = collectGroup(board, nx, ny);
    if (group.liberties.size > 0) continue;

    captures += group.stones.length;
    for (const [gx, gy] of group.stones) {
      board[gy][gx] = EMPTY;
    }
  }

  const ownGroup = collectGroup(board, x, y);
  if (ownGroup.liberties.size === 0) {
    return { legal: false, reason: "Suicide moves are not legal." };
  }

  const hash = serializeBoard(board);
  if (game.positionHistory.includes(hash)) {
    return { legal: false, reason: "That move repeats a previous board position." };
  }

  return { legal: true, board, captures, hash };
}

export function playMoveOnGame(game: GameState, x: number, y: number): GameState | { error: string } {
  const color = game.current;
  const result = evaluateMove(game, x, y, color);

  if (!result.legal) {
    return { error: result.reason };
  }

  return {
    ...game,
    board: result.board,
    captures: {
      ...game.captures,
      [color]: game.captures[color] + result.captures,
    },
    moveNumber: game.moveNumber + 1,
    passes: 0,
    lastMove: { x, y, color },
    positionHistory: [...game.positionHistory, result.hash],
    moveLog: [
      ...game.moveLog,
      {
        type: "move",
        number: game.moveNumber + 1,
        color,
        x,
        y,
        coord: coordName(x, y, game.size),
        captures: result.captures,
      },
    ],
    current: other(color),
    history: [...game.history, toSnapshot(game)],
  };
}

export function passOnGame(game: GameState): GameState {
  const color = game.current;
  const nextGame: GameState = {
    ...game,
    moveNumber: game.moveNumber + 1,
    passes: game.passes + 1,
    lastMove: null,
    moveLog: [...game.moveLog, { type: "pass", number: game.moveNumber + 1, color }],
    history: [...game.history, toSnapshot(game)],
  };

  if (nextGame.passes >= 2) {
    return finishByScore(nextGame);
  }

  return {
    ...nextGame,
    current: other(color),
  };
}

export function resignOnGame(game: GameState): GameState {
  const resigned = game.current;
  const winner = other(resigned);

  return {
    ...game,
    moveNumber: game.moveNumber + 1,
    gameOver: true,
    phase: "ended",
    winner,
    result: `${colorLetter(winner)}+R`,
    moveLog: [...game.moveLog, { type: "resign", number: game.moveNumber + 1, color: resigned }],
    history: [...game.history, toSnapshot(game)],
  };
}

export function finishByScore(game: GameState): GameState {
  const score = computeScore(game);
  const winner = score.blackTotal > score.whiteTotal ? BLACK : WHITE;

  return {
    ...game,
    gameOver: true,
    phase: "scoring",
    winner,
    result: `${colorLetter(winner)}+${Math.abs(score.blackTotal - score.whiteTotal).toFixed(1)}`,
  };
}

export function undoOnGame(game: GameState): GameState | null {
  const history = game.history.slice();
  const previous = history.pop();
  return previous ? restoreSnapshot(previous, history) : null;
}

export function computeScore(game: GameSnapshot): ScoreEstimate {
  const visited = new Set<string>();
  const territory = createCaptureCounts();

  for (let y = 0; y < game.size; y += 1) {
    for (let x = 0; x < game.size; x += 1) {
      if (game.board[y][x] !== EMPTY || visited.has(`${x},${y}`)) continue;

      const region: Coordinate[] = [];
      const borders = new Set<PlayerColor>();
      const stack: Coordinate[] = [[x, y]];

      while (stack.length > 0) {
        const current = stack.pop();
        if (!current) continue;

        const [cx, cy] = current;
        const key = `${cx},${cy}`;
        if (visited.has(key)) continue;

        visited.add(key);
        region.push([cx, cy]);

        for (const [nx, ny] of neighbors(cx, cy, game.size)) {
          const value = game.board[ny][nx];
          if (value === EMPTY && !visited.has(`${nx},${ny}`)) {
            stack.push([nx, ny]);
          } else if (value === BLACK || value === WHITE) {
            borders.add(value);
          }
        }
      }

      if (borders.size === 1) {
        const owner = Array.from(borders)[0];
        if (owner) territory[owner] += region.length;
      }
    }
  }

  return {
    blackTerritory: territory[BLACK],
    whiteTerritory: territory[WHITE],
    blackTotal: territory[BLACK] + game.captures[BLACK],
    whiteTotal: territory[WHITE] + game.captures[WHITE] + KOMI,
  };
}

export function getDefaultStatus(game: GameSnapshot): string {
  if (game.gameOver && game.result) return `Result: ${game.result}.`;
  if (game.phase === "scoring") return "Final score estimate is shown below.";
  return "Place a stone on any open intersection.";
}

export function phaseLabel(phase: Phase): string {
  if (phase === "scoring") return "Scoring";
  if (phase === "ended") return "Ended";
  return "Playing";
}

export function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function pluralize(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function formatMove(move: MoveLogEntry): string {
  if (move.type === "move") {
    const captureText = move.captures > 0 ? `, captures ${move.captures}` : "";
    return `${move.number}. ${colorName(move.color)} ${move.coord}${captureText}`;
  }

  if (move.type === "pass") return `${move.number}. ${colorName(move.color)} passes`;
  return `${move.number}. ${colorName(move.color)} resigns`;
}

export function buildSgf(game: GameSnapshot): string {
  const result = game.result ? `RE[${game.result}]` : "";
  const moves = game.moveLog
    .filter((move) => move.type === "move" || move.type === "pass")
    .map((move) => {
      const point = move.type === "move" ? sgfCoord(move.x, move.y) : "";
      return `;${colorLetter(move.color)}[${point}]`;
    })
    .join("");

  return `(;GM[1]FF[4]CA[UTF-8]AP[Tengen:1]SZ[${game.size}]KM[${KOMI}]${result}${moves})`;
}

export function getLegalMoves(game: GameSnapshot, color = game.current): LegalMove[] {
  const legal: LegalMove[] = [];

  for (let y = 0; y < game.size; y += 1) {
    for (let x = 0; x < game.size; x += 1) {
      if (game.board[y][x] !== EMPTY) continue;

      const result = evaluateMove(game, x, y, color);
      if (result.legal) legal.push({ x, y, coord: coordName(x, y, game.size) });
    }
  }

  return legal;
}

export function getPublicState(game: GameSnapshot): PublicGameState {
  return {
    size: game.size,
    board: cloneBoard(game.board),
    current: game.current,
    currentName: colorName(game.current),
    captures: {
      black: game.captures[BLACK],
      white: game.captures[WHITE],
    },
    moveNumber: game.moveNumber,
    passes: game.passes,
    gameOver: game.gameOver,
    legalMoves: getLegalMoves(game, game.current),
  };
}

export function normalizeSnapshot(snapshot: GameSnapshot): GameState {
  const size = toBoardSize(Number(snapshot.size));
  const phase = ["playing", "scoring", "ended"].includes(snapshot.phase) ? snapshot.phase : "playing";
  const normalized: GameState = {
    size,
    board: cloneBoard(snapshot.board),
    current: snapshot.current === WHITE ? WHITE : BLACK,
    captures: createCaptureCounts(
      Number(snapshot.captures && snapshot.captures[BLACK] ? snapshot.captures[BLACK] : 0),
      Number(snapshot.captures && snapshot.captures[WHITE] ? snapshot.captures[WHITE] : 0),
    ),
    moveNumber: Number(snapshot.moveNumber || 0),
    passes: Number(snapshot.passes || 0),
    phase: phase as Phase,
    gameOver: Boolean(snapshot.gameOver),
    winner: snapshot.winner === BLACK || snapshot.winner === WHITE ? snapshot.winner : null,
    result: snapshot.result || "",
    lastMove: snapshot.lastMove ? { ...snapshot.lastMove } : null,
    moveLog: Array.isArray(snapshot.moveLog) ? snapshot.moveLog.map(cloneMove) : [],
    positionHistory: Array.isArray(snapshot.positionHistory)
      ? snapshot.positionHistory.slice()
      : [serializeBoard(snapshot.board)],
    history: [],
  };

  if (normalized.positionHistory.length === 0) {
    normalized.positionHistory.push(serializeBoard(normalized.board));
  }

  return normalized;
}

export function isValidSnapshot(snapshot: unknown): snapshot is GameSnapshot {
  if (!snapshot || typeof snapshot !== "object") return false;

  const candidate = snapshot as { size?: unknown; board?: unknown };
  const size = Number(candidate.size);
  if (!isSupportedBoardSize(size)) return false;
  if (!Array.isArray(candidate.board) || candidate.board.length !== size) return false;

  return candidate.board.every(
    (row: unknown) =>
      Array.isArray(row) &&
      row.length === size &&
      row.every((value: unknown) => value === EMPTY || value === BLACK || value === WHITE),
  );
}
