import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildSgf,
  colorName,
  coordName,
  computeScore,
  createInitialState,
  getDefaultStatus,
  getLegalMoves,
  getPublicState,
  isValidSnapshot,
  normalizeSnapshot,
  passOnGame,
  playMoveOnGame,
  resignOnGame,
  toBoardSize,
  undoOnGame,
} from "../game/goEngine";
import {
  BLACK,
  BoardSettings,
  BoardSize,
  ControllerMove,
  GameState,
  PlayerColor,
  PlayerController,
  PlayMoveOptions,
  ProjectTengenApi,
  WHITE,
} from "../types";

const STORAGE_KEY = "tengen-state-v1";

interface PersistedPayload {
  game?: unknown;
  history?: unknown;
  settings?: Partial<BoardSettings>;
}

const defaultSettings: BoardSettings = {
  showCoordinates: true,
  showPreview: true,
};

function loadPersistedState(): { game: GameState; settings: BoardSettings; statusMessage: string } {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { game: createInitialState(19), settings: defaultSettings, statusMessage: "" };
    }

    const payload = JSON.parse(raw) as PersistedPayload;
    if (!isValidSnapshot(payload.game)) {
      return { game: createInitialState(19), settings: defaultSettings, statusMessage: "" };
    }

    const game = normalizeSnapshot(payload.game);
    game.history = Array.isArray(payload.history)
      ? payload.history.filter(isValidSnapshot).map(normalizeSnapshot)
      : [];

    return {
      game,
      settings: {
        showCoordinates: payload.settings?.showCoordinates !== false,
        showPreview: payload.settings?.showPreview !== false,
      },
      statusMessage: "Restored saved game.",
    };
  } catch {
    return { game: createInitialState(19), settings: defaultSettings, statusMessage: "" };
  }
}

export function useGoGame() {
  const initial = useMemo(loadPersistedState, []);
  const [game, setGame] = useState<GameState>(initial.game);
  const [settings, setSettings] = useState<BoardSettings>(initial.settings);
  const [statusMessage, setStatusMessage] = useState(initial.statusMessage);
  const [toast, setToast] = useState("");
  const controllersRef = useRef<Record<PlayerColor, PlayerController>>({
    [BLACK]: { type: "human" },
    [WHITE]: { type: "human" },
  });
  const gameRef = useRef(game);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          game,
          history: game.history,
          settings,
        }),
      );
    } catch {
      // Storage can be blocked by private browsing or strict browser settings.
    }
  }, [game, settings]);

  const score = useMemo(() => computeScore(game), [game]);

  const notify = useCallback((message: string) => {
    setToast(message);
  }, []);

  const playMove = useCallback(
    (x: number, y: number, options: PlayMoveOptions = {}) => {
      const currentGame = gameRef.current;
      const color = currentGame.current;
      const controller = controllersRef.current[color];

      if (controller.type !== "human" && !options.fromController) {
        notify(`${colorName(color)} is controlled by an external player.`);
        return false;
      }

      const nextGame = playMoveOnGame(currentGame, x, y);
      if ("error" in nextGame) {
        if (!options.quiet) notify(nextGame.error);
        return false;
      }

      setGame(nextGame);
      setStatusMessage(`${colorName(color)} played ${coordName(x, y, currentGame.size)}.`);
      return true;
    },
    [notify],
  );

  const passTurn = useCallback(() => {
    const currentGame = gameRef.current;
    if (currentGame.gameOver || currentGame.phase !== "playing") return;

    const color = currentGame.current;
    const nextGame = passOnGame(currentGame);
    setGame(nextGame);

    if (nextGame.gameOver && nextGame.winner) {
      const nextScore = computeScore(nextGame);
      const margin = Math.abs(nextScore.blackTotal - nextScore.whiteTotal).toFixed(1);
      setStatusMessage(`Both players passed. ${colorName(nextGame.winner)} leads by ${margin}.`);
    } else {
      setStatusMessage(`${colorName(color)} passed.`);
    }
  }, []);

  const resignGame = useCallback(() => {
    const currentGame = gameRef.current;
    if (currentGame.gameOver) return;

    const color = currentGame.current;
    const nextGame = resignOnGame(currentGame);
    setGame(nextGame);
    setStatusMessage(`${colorName(color)} resigned. ${colorName(nextGame.winner ?? BLACK)} wins.`);
  }, []);

  const undoMove = useCallback(() => {
    const previous = undoOnGame(gameRef.current);
    if (!previous) {
      notify("No moves to undo.");
      return;
    }

    setGame(previous);
    setStatusMessage("Undid the last action.");
  }, [notify]);

  const resetGame = useCallback((size: BoardSize | number) => {
    const boardSize = toBoardSize(Number(size));
    setGame(createInitialState(boardSize));
    setStatusMessage(`New ${boardSize} x ${boardSize} game.`);
  }, []);

  const scoreNow = useCallback(() => {
    const currentScore = computeScore(gameRef.current);
    const winner = currentScore.blackTotal > currentScore.whiteTotal ? BLACK : WHITE;
    const margin = Math.abs(currentScore.blackTotal - currentScore.whiteTotal).toFixed(1);
    setStatusMessage(`Current estimate: ${colorName(winner)} leads by ${margin}.`);
  }, []);

  const updateSettings = useCallback((patch: Partial<BoardSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const exportSgf = useCallback(async () => {
    const currentGame = gameRef.current;
    const sgf = buildSgf(currentGame);
    const fileName = `tengen-${currentGame.size}x${currentGame.size}-${Date.now()}.sgf`;
    const blob = new Blob([sgf], { type: "application/x-go-sgf;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(sgf);
        notify("SGF downloaded and copied to clipboard.");
      } else {
        notify("SGF downloaded.");
      }
    } catch {
      notify("SGF downloaded.");
    }
  }, [notify]);

  const setController = useCallback((color: PlayerColor, controller?: PlayerController | null) => {
    if (color !== BLACK && color !== WHITE) {
      throw new Error("Controller color must be BLACK or WHITE.");
    }

    controllersRef.current[color] = controller || { type: "human" };
  }, []);

  const api = useMemo<ProjectTengenApi>(
    () => ({
      colors: { EMPTY: 0, BLACK, WHITE },
      getState: () => getPublicState(gameRef.current),
      getLegalMoves: (color?: PlayerColor) => getLegalMoves(gameRef.current, color ?? gameRef.current.current),
      playMove: (x: number, y: number) => playMove(x, y, { fromController: true }),
      pass: passTurn,
      undo: undoMove,
      newGame: resetGame,
      setController,
    }),
    [passTurn, playMove, resetGame, setController, undoMove],
  );

  useEffect(() => {
    window.ProjectTengen = api;
    return () => {
      if (window.ProjectTengen === api) {
        delete window.ProjectTengen;
      }
    };
  }, [api]);

  useEffect(() => {
    const currentGame = gameRef.current;
    const controller = controllersRef.current[currentGame.current];
    if (controller.type !== "ai" || currentGame.gameOver || currentGame.phase !== "playing") return;

    let cancelled = false;
    const requestedColor = currentGame.current;

    Promise.resolve(controller.getMove(getPublicState(currentGame)))
      .then((move: ControllerMove) => {
        if (cancelled) return;
        const latest = gameRef.current;
        if (latest.current !== requestedColor || latest.gameOver || latest.phase !== "playing" || !move) return;

        if ("pass" in move && move.pass) {
          passTurn();
        } else if ("x" in move && "y" in move && Number.isInteger(move.x) && Number.isInteger(move.y)) {
          playMove(move.x, move.y, { fromController: true });
        }
      })
      .catch(() => notify("External player failed to return a move."));

    return () => {
      cancelled = true;
    };
  }, [game.current, game.gameOver, game.moveNumber, game.phase, notify, passTurn, playMove]);

  return {
    game,
    settings,
    score,
    statusText: statusMessage || getDefaultStatus(game),
    toast,
    actions: {
      playMove,
      passTurn,
      resignGame,
      undoMove,
      resetGame,
      scoreNow,
      updateSettings,
      exportSgf,
      setController,
    },
  };
}
