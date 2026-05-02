(function () {
  "use strict";

  const EMPTY = 0 as const;
  const BLACK = 1 as const;
  const WHITE = 2 as const;
  const KOMI = 6.5;
  const STORAGE_KEY = "tengen-state-v1";
  const COORD_LETTERS = "ABCDEFGHJKLMNOPQRST".split("");

  type Empty = typeof EMPTY;
  type PlayerColor = typeof BLACK | typeof WHITE;
  type BoardValue = Empty | PlayerColor;
  type Board = BoardValue[][];
  type BoardSize = 9 | 13 | 19;
  type Phase = "playing" | "scoring" | "ended";
  type Coordinate = [number, number];
  type CaptureCounts = Record<PlayerColor, number>;

  interface Point {
    x: number;
    y: number;
  }

  interface LastMove extends Point {
    color: PlayerColor;
  }

  interface StoneMove extends LastMove {
    type: "move";
    number: number;
    coord: string;
    captures: number;
  }

  interface PassMove {
    type: "pass";
    number: number;
    color: PlayerColor;
  }

  interface ResignMove {
    type: "resign";
    number: number;
    color: PlayerColor;
  }

  type MoveLogEntry = StoneMove | PassMove | ResignMove;

  interface GameSnapshot {
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

  interface GameState extends GameSnapshot {
    history: GameSnapshot[];
  }

  interface BoardMetrics {
    size: number;
    margin: number;
    gridSize: number;
    step: number;
  }

  interface Group {
    stones: Coordinate[];
    liberties: Set<string>;
  }

  type MoveEvaluation =
    | { legal: true; board: Board; captures: number; hash: string }
    | { legal: false; reason: string };

  interface ScoreEstimate {
    blackTerritory: number;
    whiteTerritory: number;
    blackTotal: number;
    whiteTotal: number;
  }

  interface PlayMoveOptions {
    fromController?: boolean;
    quiet?: boolean;
  }

  interface LegalMove extends Point {
    coord: string;
  }

  interface PublicGameState {
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

  type ControllerMove = { pass: true } | Point | null | undefined;

  interface HumanController {
    type: "human";
  }

  interface AiController {
    type: "ai";
    getMove(state: PublicGameState): ControllerMove | Promise<ControllerMove>;
  }

  type PlayerController = HumanController | AiController;

  interface UiState {
    hover: Point | null;
    showCoordinates: boolean;
    showPreview: boolean;
    statusMessage: string;
    toastTimer: number;
    playerControllers: Record<PlayerColor, PlayerController>;
  }

  interface PersistedPayload {
    game?: unknown;
    history?: unknown;
    settings?: {
      showCoordinates?: boolean;
      showPreview?: boolean;
    };
  }

  interface ProjectTengenApi {
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

  function getElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Missing required element: ${id}`);
    }
    return element as T;
  }

  const canvas = getElement<HTMLCanvasElement>("boardCanvas");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D rendering context is not available.");
  }
  const ctx = context;

  const elements = {
    boardSize: getElement<HTMLSelectElement>("boardSize"),
    gameSubtitle: getElement<HTMLParagraphElement>("gameSubtitle"),
    turnLabel: getElement<HTMLHeadingElement>("turnLabel"),
    turnStone: getElement<HTMLSpanElement>("turnStone"),
    statusText: getElement<HTMLParagraphElement>("statusText"),
    blackCaptureText: getElement<HTMLSpanElement>("blackCaptureText"),
    whiteCaptureText: getElement<HTMLSpanElement>("whiteCaptureText"),
    blackPlayerRow: getElement<HTMLDivElement>("blackPlayerRow"),
    whitePlayerRow: getElement<HTMLDivElement>("whitePlayerRow"),
    passButton: getElement<HTMLButtonElement>("passButton"),
    undoButton: getElement<HTMLButtonElement>("undoButton"),
    scoreButton: getElement<HTMLButtonElement>("scoreButton"),
    resignButton: getElement<HTMLButtonElement>("resignButton"),
    newGameButton: getElement<HTMLButtonElement>("newGameButton"),
    coordinatesToggle: getElement<HTMLInputElement>("coordinatesToggle"),
    hoverToggle: getElement<HTMLInputElement>("hoverToggle"),
    phaseBadge: getElement<HTMLSpanElement>("phaseBadge"),
    blackTerritory: getElement<HTMLElement>("blackTerritory"),
    whiteTerritory: getElement<HTMLElement>("whiteTerritory"),
    blackTotal: getElement<HTMLElement>("blackTotal"),
    whiteTotal: getElement<HTMLElement>("whiteTotal"),
    moveList: getElement<HTMLOListElement>("moveList"),
    exportButton: getElement<HTMLButtonElement>("exportButton"),
    toast: getElement<HTMLDivElement>("toast"),
    liveRegion: getElement<HTMLDivElement>("liveRegion"),
  };

  const ui: UiState = {
    hover: null,
    showCoordinates: true,
    showPreview: true,
    statusMessage: "",
    toastTimer: 0,
    playerControllers: {
      [BLACK]: { type: "human" },
      [WHITE]: { type: "human" },
    },
  };

  let state: GameState = createInitialState(19);

  function createInitialState(size: BoardSize): GameState {
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

  function createCaptureCounts(black = 0, white = 0): CaptureCounts {
    return { [BLACK]: black, [WHITE]: white };
  }

  function toBoardSize(value: number): BoardSize {
    if (value === 9 || value === 13 || value === 19) return value;
    return 19;
  }

  function createBoard(size: BoardSize): Board {
    return Array.from({ length: size }, () => Array(size).fill(EMPTY));
  }

  function cloneBoard(board: Board): Board {
    return board.map((row) => row.slice());
  }

  function cloneMove(move: MoveLogEntry): MoveLogEntry {
    return { ...move };
  }

  function cloneSnapshot(snapshot: GameSnapshot): GameSnapshot {
    return {
      size: snapshot.size,
      board: cloneBoard(snapshot.board),
      current: snapshot.current,
      captures: createCaptureCounts(Number(snapshot.captures[BLACK] || 0), Number(snapshot.captures[WHITE] || 0)),
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

  function getSnapshot(): GameSnapshot {
    return cloneSnapshot(state);
  }

  function rememberState(): void {
    state.history.push(getSnapshot());
  }

  function restoreSnapshot(snapshot: GameSnapshot, history: GameSnapshot[]): void {
    state = { ...cloneSnapshot(snapshot), history };
  }

  function serializeBoard(board: Board): string {
    return board.map((row) => row.join("")).join("/");
  }

  function other(color: PlayerColor): PlayerColor {
    return color === BLACK ? WHITE : BLACK;
  }

  function colorName(color: PlayerColor): string {
    return color === BLACK ? "Black" : "White";
  }

  function colorLetter(color: PlayerColor): "B" | "W" {
    return color === BLACK ? "B" : "W";
  }

  function coordName(x: number, y: number, size: number): string {
    return `${COORD_LETTERS[x]}${size - y}`;
  }

  function sgfCoord(x: number, y: number): string {
    return String.fromCharCode(97 + x) + String.fromCharCode(97 + y);
  }

  function isOnBoard(x: number, y: number, size: number): boolean {
    return x >= 0 && y >= 0 && x < size && y < size;
  }

  function neighbors(x: number, y: number, size: number): Coordinate[] {
    const list: Coordinate[] = [];
    if (x > 0) list.push([x - 1, y]);
    if (x < size - 1) list.push([x + 1, y]);
    if (y > 0) list.push([x, y - 1]);
    if (y < size - 1) list.push([x, y + 1]);
    return list;
  }

  function collectGroup(board: Board, startX: number, startY: number): Group {
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

  function evaluateMove(x: number, y: number, color: PlayerColor): MoveEvaluation {
    if (state.gameOver || state.phase !== "playing") {
      return { legal: false, reason: "The game is not in a playing phase." };
    }

    if (!isOnBoard(x, y, state.size)) {
      return { legal: false, reason: "That point is outside the board." };
    }

    if (state.board[y][x] !== EMPTY) {
      return { legal: false, reason: "That intersection is occupied." };
    }

    const board = cloneBoard(state.board);
    const opponent = other(color);
    let captures = 0;
    board[y][x] = color;

    for (const [nx, ny] of neighbors(x, y, state.size)) {
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
    if (state.positionHistory.includes(hash)) {
      return { legal: false, reason: "That move repeats a previous board position." };
    }

    return { legal: true, board, captures, hash };
  }

  function playMove(x: number, y: number, options?: PlayMoveOptions): boolean {
    const settings = options || {};
    const color = state.current;
    const controller = ui.playerControllers[color];

    if (controller && controller.type !== "human" && !settings.fromController) {
      showToast(`${colorName(color)} is controlled by an external player.`);
      return false;
    }

    const result = evaluateMove(x, y, color);
    if (!result.legal) {
      if (!settings.quiet) showToast(result.reason);
      return false;
    }

    rememberState();
    state.board = result.board;
    state.captures[color] += result.captures;
    state.moveNumber += 1;
    state.passes = 0;
    state.lastMove = { x, y, color };
    state.positionHistory.push(result.hash);
    state.moveLog.push({
      type: "move",
      number: state.moveNumber,
      color,
      x,
      y,
      coord: coordName(x, y, state.size),
      captures: result.captures,
    });
    state.current = other(color);
    ui.statusMessage = `${colorName(color)} played ${coordName(x, y, state.size)}.`;
    saveGame();
    render();
    maybeRequestControllerMove();
    return true;
  }

  function passTurn(): void {
    if (state.gameOver || state.phase !== "playing") return;

    const color = state.current;
    rememberState();
    state.moveNumber += 1;
    state.passes += 1;
    state.lastMove = null;
    state.moveLog.push({
      type: "pass",
      number: state.moveNumber,
      color,
    });

    if (state.passes >= 2) {
      finishByScore();
    } else {
      state.current = other(color);
      ui.statusMessage = `${colorName(color)} passed.`;
    }

    saveGame();
    render();
    maybeRequestControllerMove();
  }

  function resignGame(): void {
    if (state.gameOver) return;
    const resigned = state.current;
    const winner = other(resigned);
    rememberState();
    state.moveNumber += 1;
    state.gameOver = true;
    state.phase = "ended";
    state.winner = winner;
    state.result = `${colorLetter(winner)}+R`;
    state.moveLog.push({
      type: "resign",
      number: state.moveNumber,
      color: resigned,
    });
    ui.statusMessage = `${colorName(resigned)} resigned. ${colorName(winner)} wins.`;
    saveGame();
    render();
  }

  function finishByScore(): void {
    const score = computeScore();
    const winner = score.blackTotal > score.whiteTotal ? BLACK : WHITE;
    state.gameOver = true;
    state.phase = "scoring";
    state.winner = winner;
    state.result = `${colorLetter(winner)}+${Math.abs(score.blackTotal - score.whiteTotal).toFixed(1)}`;
    ui.statusMessage = `Both players passed. ${colorName(winner)} leads by ${Math.abs(
      score.blackTotal - score.whiteTotal,
    ).toFixed(1)}.`;
  }

  function undoMove(): void {
    if (state.history.length === 0) {
      showToast("No moves to undo.");
      return;
    }

    const history = state.history.slice();
    const previous = history.pop();
    if (!previous) return;
    restoreSnapshot(previous, history);
    ui.statusMessage = "Undid the last action.";
    saveGame();
    render();
  }

  function computeScore(): ScoreEstimate {
    const visited = new Set<string>();
    const territory = createCaptureCounts();

    for (let y = 0; y < state.size; y += 1) {
      for (let x = 0; x < state.size; x += 1) {
        if (state.board[y][x] !== EMPTY || visited.has(`${x},${y}`)) continue;

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

          for (const [nx, ny] of neighbors(cx, cy, state.size)) {
            const value = state.board[ny][nx];
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
      blackTotal: territory[BLACK] + state.captures[BLACK],
      whiteTotal: territory[WHITE] + state.captures[WHITE] + KOMI,
    };
  }

  function getBoardMetrics(): BoardMetrics {
    const size = canvas.clientWidth || 640;
    const hasCoords = ui.showCoordinates;
    const margin = hasCoords
      ? Math.max(34, Math.min(62, size * 0.077))
      : Math.max(22, Math.min(46, size * 0.056));
    const gridSize = size - margin * 2;
    const step = gridSize / (state.size - 1);
    return { size, margin, gridSize, step };
  }

  function resizeCanvas(): void {
    const metrics = getBoardMetrics();
    const dpr = window.devicePixelRatio || 1;
    const target = Math.max(320, Math.round(metrics.size));
    const pixelSize = Math.round(target * dpr);

    if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
      canvas.width = pixelSize;
      canvas.height = pixelSize;
    }

    drawBoard();
  }

  function drawBoard(): void {
    const dpr = window.devicePixelRatio || 1;
    const metrics = getBoardMetrics();
    const { size, margin, step } = metrics;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    drawWood(size);
    drawGrid(metrics);

    if (ui.showCoordinates) drawCoordinates(metrics);
    drawStarPoints(metrics);

    for (let y = 0; y < state.size; y += 1) {
      for (let x = 0; x < state.size; x += 1) {
        const value = state.board[y][x];
        if (value === EMPTY) continue;
        drawStone(margin + x * step, margin + y * step, step * 0.43, value, 1);
      }
    }

    if (
      ui.showPreview &&
      ui.hover &&
      state.phase === "playing" &&
      !state.gameOver &&
      state.board[ui.hover.y][ui.hover.x] === EMPTY
    ) {
      const preview = evaluateMove(ui.hover.x, ui.hover.y, state.current);
      const px = margin + ui.hover.x * step;
      const py = margin + ui.hover.y * step;
      if (preview.legal) {
        drawStone(px, py, step * 0.42, state.current, 0.45);
      } else {
        ctx.save();
        ctx.strokeStyle = "rgba(173, 77, 45, 0.85)";
        ctx.lineWidth = Math.max(2, step * 0.07);
        ctx.beginPath();
        ctx.arc(px, py, step * 0.27, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    if (state.lastMove) {
      const px = margin + state.lastMove.x * step;
      const py = margin + state.lastMove.y * step;
      drawLastMoveMarker(px, py, step, state.lastMove.color);
    }
  }

  function drawWood(size: number): void {
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, "#dba35a");
    gradient.addColorStop(0.45, "#efc87c");
    gradient.addColorStop(1, "#c99046");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    ctx.save();
    ctx.globalAlpha = 0.18;
    for (let y = 12; y < size; y += 16) {
      ctx.beginPath();
      ctx.strokeStyle = y % 48 === 0 ? "#8f5f2b" : "#fff0bd";
      ctx.lineWidth = 1;
      for (let x = -8; x <= size + 8; x += 16) {
        const wave = Math.sin((x + y * 0.4) * 0.022) * 5;
        if (x === -8) ctx.moveTo(x, y + wave);
        else ctx.lineTo(x, y + wave);
      }
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = "rgba(72, 48, 25, 0.5)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);
  }

  function drawGrid(metrics: BoardMetrics): void {
    const { margin, step } = metrics;
    const end = margin + step * (state.size - 1);
    ctx.save();
    ctx.strokeStyle = "rgba(45, 31, 18, 0.78)";
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let i = 0; i < state.size; i += 1) {
      const pos = margin + i * step;
      ctx.moveTo(margin, pos);
      ctx.lineTo(end, pos);
      ctx.moveTo(pos, margin);
      ctx.lineTo(pos, end);
    }

    ctx.stroke();
    ctx.restore();
  }

  function drawCoordinates(metrics: BoardMetrics): void {
    const { size, margin, step } = metrics;
    const fontSize = Math.max(10, Math.min(15, step * 0.32));
    ctx.save();
    ctx.fillStyle = "rgba(50, 34, 18, 0.78)";
    ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let i = 0; i < state.size; i += 1) {
      const pos = margin + i * step;
      const letter = COORD_LETTERS[i];
      const number = String(state.size - i);
      ctx.fillText(letter, pos, margin * 0.45);
      ctx.fillText(letter, pos, size - margin * 0.45);
      ctx.fillText(number, margin * 0.45, pos);
      ctx.fillText(number, size - margin * 0.45, pos);
    }

    ctx.restore();
  }

  function drawStarPoints(metrics: BoardMetrics): void {
    const { margin, step } = metrics;
    const points = getStarPoints(state.size);
    const radius = Math.max(3, Math.min(5, step * 0.1));

    ctx.save();
    ctx.fillStyle = "rgba(45, 31, 18, 0.9)";
    for (const [x, y] of points) {
      ctx.beginPath();
      ctx.arc(margin + x * step, margin + y * step, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function getStarPoints(size: BoardSize): Coordinate[] {
    if (size === 19) {
      return [
        [3, 3],
        [9, 3],
        [15, 3],
        [3, 9],
        [9, 9],
        [15, 9],
        [3, 15],
        [9, 15],
        [15, 15],
      ];
    }

    if (size === 13) {
      return [
        [3, 3],
        [6, 3],
        [9, 3],
        [3, 6],
        [6, 6],
        [9, 6],
        [3, 9],
        [6, 9],
        [9, 9],
      ];
    }

    return [
      [2, 2],
      [4, 2],
      [6, 2],
      [2, 4],
      [4, 4],
      [6, 4],
      [2, 6],
      [4, 6],
      [6, 6],
    ];
  }

  function drawStone(x: number, y: number, radius: number, color: PlayerColor, alpha: number): void {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = "rgba(31, 21, 12, 0.33)";
    ctx.shadowBlur = radius * 0.35;
    ctx.shadowOffsetY = radius * 0.16;

    const gradient = ctx.createRadialGradient(
      x - radius * 0.32,
      y - radius * 0.36,
      radius * 0.1,
      x,
      y,
      radius,
    );

    if (color === BLACK) {
      gradient.addColorStop(0, "#5f5d58");
      gradient.addColorStop(0.42, "#1b1a18");
      gradient.addColorStop(1, "#040404");
    } else {
      gradient.addColorStop(0, "#ffffff");
      gradient.addColorStop(0.48, "#f0ece2");
      gradient.addColorStop(1, "#bdb6aa");
    }

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor = "transparent";
    ctx.strokeStyle = color === BLACK ? "rgba(0, 0, 0, 0.65)" : "rgba(90, 83, 72, 0.7)";
    ctx.lineWidth = Math.max(1, radius * 0.06);
    ctx.stroke();
    ctx.restore();
  }

  function drawLastMoveMarker(x: number, y: number, step: number, color: PlayerColor): void {
    ctx.save();
    ctx.fillStyle = color === BLACK ? "rgba(255, 255, 255, 0.86)" : "rgba(20, 17, 14, 0.78)";
    ctx.beginPath();
    ctx.arc(x, y, Math.max(3, step * 0.1), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function eventToPoint(event: MouseEvent | PointerEvent): Point | null {
    const rect = canvas.getBoundingClientRect();
    const metrics = getBoardMetrics();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const boardX = Math.round((x - metrics.margin) / metrics.step);
    const boardY = Math.round((y - metrics.margin) / metrics.step);

    if (!isOnBoard(boardX, boardY, state.size)) return null;

    const px = metrics.margin + boardX * metrics.step;
    const py = metrics.margin + boardY * metrics.step;
    const tolerance = metrics.step * 0.46;
    if (Math.abs(x - px) > tolerance || Math.abs(y - py) > tolerance) return null;

    return { x: boardX, y: boardY };
  }

  function updateHover(point: Point | null): void {
    if (!point) {
      ui.hover = null;
    } else {
      ui.hover = point;
    }
    drawBoard();
  }

  function keyboardMove(dx: number, dy: number): void {
    const current = ui.hover || {
      x: state.lastMove ? state.lastMove.x : Math.floor(state.size / 2),
      y: state.lastMove ? state.lastMove.y : Math.floor(state.size / 2),
    };

    ui.hover = {
      x: Math.max(0, Math.min(state.size - 1, current.x + dx)),
      y: Math.max(0, Math.min(state.size - 1, current.y + dy)),
    };

    const coord = coordName(ui.hover.x, ui.hover.y, state.size);
    elements.liveRegion.textContent = `Cursor on ${coord}.`;
    drawBoard();
  }

  function render(): void {
    const score = computeScore();
    const currentColor = state.current;
    const activeClass = currentColor === BLACK ? "black" : "white";
    const inactiveClass = currentColor === BLACK ? "white" : "black";

    elements.boardSize.value = String(state.size);
    elements.gameSubtitle.textContent = `${state.size} x ${state.size} board`;
    elements.turnStone.classList.remove(inactiveClass);
    elements.turnStone.classList.add(activeClass);

    if (state.gameOver) {
      elements.turnLabel.textContent = state.winner
        ? `${colorName(state.winner)} wins`
        : "Game finished";
    } else {
      elements.turnLabel.textContent = `${colorName(state.current)} to play`;
    }

    elements.statusText.textContent = ui.statusMessage || getDefaultStatus();
    elements.blackCaptureText.textContent = pluralize(state.captures[BLACK], "capture");
    elements.whiteCaptureText.textContent = pluralize(state.captures[WHITE], "capture");
    elements.blackPlayerRow.classList.toggle("is-active", !state.gameOver && state.current === BLACK);
    elements.whitePlayerRow.classList.toggle("is-active", !state.gameOver && state.current === WHITE);
    elements.phaseBadge.textContent = phaseLabel();
    elements.blackTerritory.textContent = String(score.blackTerritory);
    elements.whiteTerritory.textContent = String(score.whiteTerritory);
    elements.blackTotal.textContent = formatScore(score.blackTotal);
    elements.whiteTotal.textContent = formatScore(score.whiteTotal);
    elements.undoButton.disabled = state.history.length === 0;
    elements.passButton.disabled = state.gameOver || state.phase !== "playing";
    elements.resignButton.disabled = state.gameOver || state.phase !== "playing";

    renderMoveList();
    resizeCanvas();
  }

  function getDefaultStatus(): string {
    if (state.gameOver && state.result) return `Result: ${state.result}.`;
    if (state.phase === "scoring") return "Final score estimate is shown below.";
    return "Place a stone on any open intersection.";
  }

  function phaseLabel(): string {
    if (state.phase === "scoring") return "Scoring";
    if (state.phase === "ended") return "Ended";
    return "Playing";
  }

  function formatScore(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  function pluralize(count: number, word: string): string {
    return `${count} ${word}${count === 1 ? "" : "s"}`;
  }

  function renderMoveList(): void {
    elements.moveList.innerHTML = "";
    const fragment = document.createDocumentFragment();

    if (state.moveLog.length === 0) {
      const empty = document.createElement("li");
      empty.textContent = "No moves yet.";
      fragment.appendChild(empty);
    } else {
      for (const move of state.moveLog) {
        const item = document.createElement("li");
        item.textContent = formatMove(move);
        fragment.appendChild(item);
      }
    }

    elements.moveList.appendChild(fragment);
    elements.moveList.scrollTop = elements.moveList.scrollHeight;
  }

  function formatMove(move: MoveLogEntry): string {
    if (move.type === "move") {
      const captureText = move.captures > 0 ? `, captures ${move.captures}` : "";
      return `${move.number}. ${colorName(move.color)} ${move.coord}${captureText}`;
    }
    if (move.type === "pass") return `${move.number}. ${colorName(move.color)} passes`;
    return `${move.number}. ${colorName(move.color)} resigns`;
  }

  function scoreNow(): void {
    const score = computeScore();
    const winner = score.blackTotal > score.whiteTotal ? BLACK : WHITE;
    const margin = Math.abs(score.blackTotal - score.whiteTotal).toFixed(1);
    ui.statusMessage = `Current estimate: ${colorName(winner)} leads by ${margin}.`;
    render();
  }

  function resetGame(size: BoardSize | number): void {
    const boardSize = toBoardSize(size);
    state = createInitialState(boardSize);
    ui.hover = null;
    ui.statusMessage = `New ${boardSize} x ${boardSize} game.`;
    saveGame();
    render();
  }

  function buildSgf(): string {
    const result = state.result ? `RE[${state.result}]` : "";
    const moves = state.moveLog
      .filter((move) => move.type === "move" || move.type === "pass")
      .map((move) => {
        const point = move.type === "move" ? sgfCoord(move.x, move.y) : "";
        return `;${colorLetter(move.color)}[${point}]`;
      })
      .join("");

    return `(;GM[1]FF[4]CA[UTF-8]AP[ProjectTengen:1]SZ[${state.size}]KM[${KOMI}]${result}${moves})`;
  }

  async function exportSgf(): Promise<void> {
    const sgf = buildSgf();
    const fileName = `tengen-${state.size}x${state.size}-${Date.now()}.sgf`;
    const blob = new Blob([sgf], { type: "application/x-go-sgf;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(sgf);
        showToast("SGF downloaded and copied to clipboard.");
      } else {
        showToast("SGF downloaded.");
      }
    } catch (error) {
      showToast("SGF downloaded.");
    }
  }

  function showToast(message: string): void {
    window.clearTimeout(ui.toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    elements.liveRegion.textContent = message;
    ui.toastTimer = window.setTimeout(() => {
      elements.toast.classList.remove("is-visible");
    }, 2600);
  }

  function saveGame(): void {
    try {
      const payload = {
        game: getSnapshot(),
        history: state.history.map(cloneSnapshot),
        settings: {
          showCoordinates: ui.showCoordinates,
          showPreview: ui.showPreview,
        },
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      // Private browsing and strict storage settings can block local persistence.
    }
  }

  function loadGame(): boolean {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;

      const payload = JSON.parse(raw) as PersistedPayload;
      if (!payload || !isValidSnapshot(payload.game)) return false;

      state = normalizeSnapshot(payload.game);
      state.history = Array.isArray(payload.history)
        ? payload.history.filter(isValidSnapshot).map(normalizeSnapshot)
        : [];

      if (payload.settings) {
        ui.showCoordinates = payload.settings.showCoordinates !== false;
        ui.showPreview = payload.settings.showPreview !== false;
      }

      elements.coordinatesToggle.checked = ui.showCoordinates;
      elements.hoverToggle.checked = ui.showPreview;
      ui.statusMessage = "Restored saved game.";
      return true;
    } catch (error) {
      return false;
    }
  }

  function isValidSnapshot(snapshot: unknown): snapshot is GameSnapshot {
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

  function isSupportedBoardSize(size: number): size is BoardSize {
    return size === 9 || size === 13 || size === 19;
  }

  function normalizeSnapshot(snapshot: GameSnapshot): GameState {
    const size = toBoardSize(Number(snapshot.size));
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
      phase: ["playing", "scoring", "ended"].includes(snapshot.phase) ? snapshot.phase : "playing",
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

  function maybeRequestControllerMove(): void {
    const controller = ui.playerControllers[state.current];
    if (!controller || controller.type !== "ai" || typeof controller.getMove !== "function") return;
    if (state.gameOver || state.phase !== "playing") return;

    Promise.resolve()
      .then(() => controller.getMove(getPublicState()))
      .then((move: ControllerMove) => {
        if (!move || state.gameOver || state.phase !== "playing") return;
        if ("pass" in move && move.pass) {
          passTurn();
        } else if ("x" in move && "y" in move && Number.isInteger(move.x) && Number.isInteger(move.y)) {
          playMove(move.x, move.y, { fromController: true });
        }
      })
      .catch(() => {
        showToast("External player failed to return a move.");
      });
  }

  function getLegalMoves(color?: PlayerColor): LegalMove[] {
    const legal: LegalMove[] = [];
    const turn = color || state.current;

    for (let y = 0; y < state.size; y += 1) {
      for (let x = 0; x < state.size; x += 1) {
        if (state.board[y][x] !== EMPTY) continue;
        const result = evaluateMove(x, y, turn);
        if (result.legal) legal.push({ x, y, coord: coordName(x, y, state.size) });
      }
    }

    return legal;
  }

  function getPublicState(): PublicGameState {
    return {
      size: state.size,
      board: cloneBoard(state.board),
      current: state.current,
      currentName: colorName(state.current),
      captures: {
        black: state.captures[BLACK],
        white: state.captures[WHITE],
      },
      moveNumber: state.moveNumber,
      passes: state.passes,
      gameOver: state.gameOver,
      legalMoves: getLegalMoves(state.current),
    };
  }

  function registerEvents(): void {
    canvas.addEventListener("pointermove", (event) => {
      updateHover(eventToPoint(event));
    });

    canvas.addEventListener("pointerleave", () => {
      updateHover(null);
    });

    canvas.addEventListener("click", (event) => {
      const point = eventToPoint(event);
      if (point) playMove(point.x, point.y);
    });

    canvas.addEventListener("keydown", (event) => {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        keyboardMove(0, -1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        keyboardMove(0, 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        keyboardMove(-1, 0);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        keyboardMove(1, 0);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (ui.hover) playMove(ui.hover.x, ui.hover.y);
      }
    });

    elements.passButton.addEventListener("click", passTurn);
    elements.undoButton.addEventListener("click", undoMove);
    elements.scoreButton.addEventListener("click", scoreNow);
    elements.exportButton.addEventListener("click", exportSgf);

    elements.resignButton.addEventListener("click", () => {
      if (window.confirm(`${colorName(state.current)} resigns?`)) {
        resignGame();
      }
    });

    elements.newGameButton.addEventListener("click", () => {
      const size = Number(elements.boardSize.value);
      if (state.moveNumber > 0 && !window.confirm("Start a new game and clear the board?")) {
        return;
      }
      resetGame(size);
    });

    elements.boardSize.addEventListener("change", () => {
      const size = Number(elements.boardSize.value);
      if (state.moveNumber > 0 && !window.confirm("Changing board size starts a new game. Continue?")) {
        elements.boardSize.value = String(state.size);
        return;
      }
      resetGame(size);
    });

    elements.coordinatesToggle.addEventListener("change", () => {
      ui.showCoordinates = elements.coordinatesToggle.checked;
      saveGame();
      render();
    });

    elements.hoverToggle.addEventListener("change", () => {
      ui.showPreview = elements.hoverToggle.checked;
      saveGame();
      render();
    });

    window.addEventListener("resize", resizeCanvas);
  }

  (window as unknown as Window & { ProjectTengen: ProjectTengenApi }).ProjectTengen = {
    colors: { EMPTY, BLACK, WHITE },
    getState: getPublicState,
    getLegalMoves,
    playMove: (x, y) => playMove(x, y, { fromController: true }),
    pass: passTurn,
    undo: undoMove,
    newGame: resetGame,
    setController(color, controller) {
      if (color !== BLACK && color !== WHITE) {
        throw new Error("Controller color must be BLACK or WHITE.");
      }
      ui.playerControllers[color] = controller || { type: "human" };
      maybeRequestControllerMove();
    },
  };

  registerEvents();
  loadGame();
  render();
})();
