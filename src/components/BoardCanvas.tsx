import { PointerEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";

import { coordName, evaluateMove, isOnBoard } from "../game/goEngine";
import {
  BLACK,
  BoardMetrics,
  BoardSettings,
  COORD_LETTERS,
  EMPTY,
  GameState,
  PlayerColor,
  Point,
} from "../types";

interface BoardCanvasProps {
  game: GameState;
  settings: BoardSettings;
  onPlayMove(x: number, y: number): boolean;
}

export function BoardCanvas({ game, settings, onPlayMove }: BoardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hover, setHover] = useState<Point | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    resizeCanvas(canvas, context, game, settings, hover);
  }, [game, hover, settings]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [draw]);

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    setHover(eventToPoint(event.currentTarget, event, game, settings));
  };

  const handleClick = (event: PointerEvent<HTMLCanvasElement>) => {
    const point = eventToPoint(event.currentTarget, event, game, settings);
    if (point) onPlayMove(point.x, point.y);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHover((current) => moveKeyboardCursor(current, game, 0, -1));
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setHover((current) => moveKeyboardCursor(current, game, 0, 1));
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      setHover((current) => moveKeyboardCursor(current, game, -1, 0));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setHover((current) => moveKeyboardCursor(current, game, 1, 0));
    } else if ((event.key === "Enter" || event.key === " ") && hover) {
      event.preventDefault();
      onPlayMove(hover.x, hover.y);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      id="boardCanvas"
      width={960}
      height={960}
      tabIndex={0}
      role="img"
      aria-label={`Interactive ${game.size} by ${game.size} go board`}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setHover(null)}
      onPointerDown={handleClick}
      onKeyDown={handleKeyDown}
    />
  );
}

function moveKeyboardCursor(current: Point | null, game: GameState, dx: number, dy: number): Point {
  const fallback = {
    x: game.lastMove ? game.lastMove.x : Math.floor(game.size / 2),
    y: game.lastMove ? game.lastMove.y : Math.floor(game.size / 2),
  };
  const point = current ?? fallback;

  return {
    x: Math.max(0, Math.min(game.size - 1, point.x + dx)),
    y: Math.max(0, Math.min(game.size - 1, point.y + dy)),
  };
}

function resizeCanvas(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  game: GameState,
  settings: BoardSettings,
  hover: Point | null,
) {
  const metrics = getBoardMetrics(canvas, game, settings);
  const dpr = window.devicePixelRatio || 1;
  const target = Math.max(320, Math.round(metrics.size));
  const pixelSize = Math.round(target * dpr);

  if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
    canvas.width = pixelSize;
    canvas.height = pixelSize;
  }

  drawBoard(context, metrics, game, settings, hover);
}

function getBoardMetrics(canvas: HTMLCanvasElement, game: GameState, settings: BoardSettings): BoardMetrics {
  const size = canvas.clientWidth || 640;
  const margin = settings.showCoordinates
    ? Math.max(34, Math.min(62, size * 0.077))
    : Math.max(22, Math.min(46, size * 0.056));
  const gridSize = size - margin * 2;
  const step = gridSize / (game.size - 1);

  return { size, margin, gridSize, step };
}

function eventToPoint(
  canvas: HTMLCanvasElement,
  event: { clientX: number; clientY: number },
  game: GameState,
  settings: BoardSettings,
) {
  const rect = canvas.getBoundingClientRect();
  const metrics = getBoardMetrics(canvas, game, settings);
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const boardX = Math.round((x - metrics.margin) / metrics.step);
  const boardY = Math.round((y - metrics.margin) / metrics.step);

  if (!isOnBoard(boardX, boardY, game.size)) return null;

  const px = metrics.margin + boardX * metrics.step;
  const py = metrics.margin + boardY * metrics.step;
  const tolerance = metrics.step * 0.46;
  if (Math.abs(x - px) > tolerance || Math.abs(y - py) > tolerance) return null;

  return { x: boardX, y: boardY };
}

function drawBoard(
  ctx: CanvasRenderingContext2D,
  metrics: BoardMetrics,
  game: GameState,
  settings: BoardSettings,
  hover: Point | null,
) {
  const dpr = window.devicePixelRatio || 1;
  const { size, margin, step } = metrics;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);
  drawWood(ctx, size);
  drawGrid(ctx, metrics, game);

  if (settings.showCoordinates) drawCoordinates(ctx, metrics, game);
  drawStarPoints(ctx, metrics, game);

  for (let y = 0; y < game.size; y += 1) {
    for (let x = 0; x < game.size; x += 1) {
      const value = game.board[y][x];
      if (value === EMPTY) continue;
      drawStone(ctx, margin + x * step, margin + y * step, step * 0.43, value, 1);
    }
  }

  if (
    settings.showPreview &&
    hover &&
    game.phase === "playing" &&
    !game.gameOver &&
    game.board[hover.y][hover.x] === EMPTY
  ) {
    const preview = evaluateMove(game, hover.x, hover.y, game.current);
    const px = margin + hover.x * step;
    const py = margin + hover.y * step;

    if (preview.legal) {
      drawStone(ctx, px, py, step * 0.42, game.current, 0.45);
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

  if (game.lastMove) {
    const px = margin + game.lastMove.x * step;
    const py = margin + game.lastMove.y * step;
    drawLastMoveMarker(ctx, px, py, step, game.lastMove.color);
  }
}

function drawWood(ctx: CanvasRenderingContext2D, size: number) {
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

function drawGrid(ctx: CanvasRenderingContext2D, metrics: BoardMetrics, game: GameState) {
  const { margin, step } = metrics;
  const end = margin + step * (game.size - 1);

  ctx.save();
  ctx.strokeStyle = "rgba(45, 31, 18, 0.78)";
  ctx.lineWidth = 1;
  ctx.beginPath();

  for (let i = 0; i < game.size; i += 1) {
    const pos = margin + i * step;
    ctx.moveTo(margin, pos);
    ctx.lineTo(end, pos);
    ctx.moveTo(pos, margin);
    ctx.lineTo(pos, end);
  }

  ctx.stroke();
  ctx.restore();
}

function drawCoordinates(ctx: CanvasRenderingContext2D, metrics: BoardMetrics, game: GameState) {
  const { size, margin, step } = metrics;
  const fontSize = Math.max(10, Math.min(15, step * 0.32));

  ctx.save();
  ctx.fillStyle = "rgba(50, 34, 18, 0.78)";
  ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let i = 0; i < game.size; i += 1) {
    const pos = margin + i * step;
    const letter = COORD_LETTERS[i];
    const number = String(game.size - i);
    ctx.fillText(letter, pos, margin * 0.45);
    ctx.fillText(letter, pos, size - margin * 0.45);
    ctx.fillText(number, margin * 0.45, pos);
    ctx.fillText(number, size - margin * 0.45, pos);
  }

  ctx.restore();
}

function drawStarPoints(ctx: CanvasRenderingContext2D, metrics: BoardMetrics, game: GameState) {
  const { margin, step } = metrics;
  const points = getStarPoints(game.size);
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

function getStarPoints(size: number) {
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

function drawStone(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: PlayerColor,
  alpha: number,
) {
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

function drawLastMoveMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  step: number,
  color: PlayerColor,
) {
  ctx.save();
  ctx.fillStyle = color === BLACK ? "rgba(255, 255, 255, 0.86)" : "rgba(20, 17, 14, 0.78)";
  ctx.beginPath();
  ctx.arc(x, y, Math.max(3, step * 0.1), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
